"""Orchestrates the Data → Models → Judge pipeline for a benchmark run."""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlmodel import select

from ..database import session_scope
from ..models.benchmark_run import BenchmarkRun, RunStatus
from ..models.example import DatasetExample
from ..models.judge_score import JudgeScore
from ..models.model_output import ModelOutput
from ..models.prompt_template import PromptTemplate
from . import prompt_renderer
from .judge_runner import JudgeRunner
from .ollama_client import OllamaClient, OllamaError


logger = logging.getLogger(__name__)


@dataclass
class _ExampleSnapshot:
    """Plain-Python snapshot of an example so we can use it after a session closes."""

    id: int
    input: str
    reference: Optional[str]
    category: Optional[str]
    difficulty: Optional[str]


class BenchmarkRunner:
    """Runs a benchmark end-to-end.

    Designed to be invoked via FastAPI background task. Each model/example error is captured
    so a single failure never breaks the whole run.
    """

    def __init__(self, ollama: Optional[OllamaClient] = None) -> None:
        self.ollama = ollama or OllamaClient()

    async def run(self, run_id: int) -> None:
        try:
            await self._execute(run_id)
        except Exception as exc:  # noqa: BLE001  keep the worker process alive on any error
            logger.exception("Benchmark run %s crashed", run_id)
            with session_scope() as session:
                run = session.get(BenchmarkRun, run_id)
                if run is not None:
                    run.status = RunStatus.FAILED
                    run.error = str(exc)
                    run.completed_at = datetime.utcnow()
                    session.add(run)

    async def _execute(self, run_id: int) -> None:
        # ---- Phase 1: load everything into plain Python and mark the run as RUNNING.
        with session_scope() as session:
            run = session.get(BenchmarkRun, run_id)
            if run is None:
                logger.warning("Run %s not found", run_id)
                return

            config = json.loads(run.config_json) if run.config_json else {}
            models: List[str] = json.loads(run.selected_models_json or "[]")
            judge_model = run.judge_model

            template = session.get(PromptTemplate, run.prompt_template_id)
            if template is None:
                run.status = RunStatus.FAILED
                run.error = "Prompt template not found"
                run.completed_at = datetime.utcnow()
                session.add(run)
                return

            example_rows = session.exec(
                select(DatasetExample).where(DatasetExample.dataset_id == run.dataset_id)
            ).all()
            if not example_rows:
                run.status = RunStatus.FAILED
                run.error = "Dataset has no examples"
                run.completed_at = datetime.utcnow()
                session.add(run)
                return

            examples: List[_ExampleSnapshot] = [
                _ExampleSnapshot(
                    id=row.id or 0,
                    input=row.input,
                    reference=row.reference,
                    category=row.category,
                    difficulty=row.difficulty,
                )
                for row in example_rows
            ]
            template_snapshot = {
                "system_prompt": template.system_prompt,
                "template": template.template,
            }

            run.status = RunStatus.RUNNING
            run.started_at = datetime.utcnow()
            run.progress_total = len(examples) * len(models)
            run.progress_done = 0
            run.error = None
            session.add(run)

        temperature = float(config.get("temperature", 0.2))
        max_tokens = int(config.get("max_tokens", 512))

        # ---- Phase 2: generation across every (model, example) pair.
        for model_name in models:
            for example in examples:
                await self._run_single(
                    run_id=run_id,
                    model_name=model_name,
                    example=example,
                    template_snapshot=template_snapshot,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )

        # ---- Phase 3: optional judge phase.
        if judge_model:
            await self._run_judge_phase(run_id=run_id, judge_model=judge_model)

        # ---- Phase 4: finalize.
        with session_scope() as session:
            run = session.get(BenchmarkRun, run_id)
            if run is not None:
                run.status = RunStatus.COMPLETED
                run.completed_at = datetime.utcnow()
                session.add(run)

    async def _run_single(
        self,
        *,
        run_id: int,
        model_name: str,
        example: _ExampleSnapshot,
        template_snapshot: Dict[str, Optional[str]],
        temperature: float,
        max_tokens: int,
    ) -> None:
        variables = prompt_renderer.example_variables(
            input_text=example.input,
            reference=example.reference,
            category=example.category,
            difficulty=example.difficulty,
        )
        rendered_user = prompt_renderer.render(template_snapshot["template"] or "{{input}}", variables)
        messages: List[Dict[str, str]] = []
        system_prompt = template_snapshot.get("system_prompt")
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": rendered_user})

        output_text: Optional[str] = None
        latency_ms: Optional[float] = None
        total_duration = load_duration = prompt_eval_count = prompt_eval_duration = None
        eval_count = eval_duration = None
        tokens_per_second: Optional[float] = None
        error: Optional[str] = None

        try:
            chat = await self.ollama.chat(
                model=model_name,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            output_text = chat.content
            latency_ms = chat.latency_ms
            total_duration = chat.total_duration
            load_duration = chat.load_duration
            prompt_eval_count = chat.prompt_eval_count
            prompt_eval_duration = chat.prompt_eval_duration
            eval_count = chat.eval_count
            eval_duration = chat.eval_duration
            tokens_per_second = chat.tokens_per_second
        except OllamaError as exc:
            error = str(exc)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            error = f"Unexpected error: {exc}"

        with session_scope() as session:
            session.add(
                ModelOutput(
                    run_id=run_id,
                    example_id=example.id,
                    model_name=model_name,
                    input=example.input,
                    rendered_prompt=rendered_user,
                    reference=example.reference,
                    output=output_text,
                    latency_ms=latency_ms,
                    total_duration=total_duration,
                    load_duration=load_duration,
                    prompt_eval_count=prompt_eval_count,
                    prompt_eval_duration=prompt_eval_duration,
                    eval_count=eval_count,
                    eval_duration=eval_duration,
                    tokens_per_second=tokens_per_second,
                    error=error,
                )
            )
            run = session.get(BenchmarkRun, run_id)
            if run is not None:
                run.progress_done = min(run.progress_done + 1, run.progress_total)
                session.add(run)

    async def _run_judge_phase(self, *, run_id: int, judge_model: str) -> None:
        """Score every generated output that does not yet have a judge entry."""
        judge = JudgeRunner(self.ollama)

        # Snapshot the work to do, then iterate without holding a session.
        jobs: List[Dict[str, Any]] = []
        with session_scope() as session:
            existing_ids = {
                row.model_output_id
                for row in session.exec(select(JudgeScore)).all()
            }
            outputs = session.exec(
                select(ModelOutput).where(ModelOutput.run_id == run_id)
            ).all()
            for item in outputs:
                if item.id is None or item.id in existing_ids:
                    continue
                if item.error:
                    continue
                example = session.get(DatasetExample, item.example_id)
                jobs.append(
                    {
                        "output_id": item.id,
                        "input": item.input,
                        "reference": item.reference,
                        "output": item.output,
                        "category": example.category if example else None,
                        "difficulty": example.difficulty if example else None,
                    }
                )

        for job in jobs:
            verdict = await judge.judge(
                model=judge_model,
                input_text=job["input"],
                reference=job["reference"],
                candidate=job["output"],
                category=job["category"],
                difficulty=job["difficulty"],
            )
            with session_scope() as session:
                session.add(
                    JudgeScore(
                        model_output_id=job["output_id"],
                        judge_model=judge_model,
                        correctness=verdict.correctness,
                        factuality=verdict.factuality,
                        completeness=verdict.completeness,
                        conciseness=verdict.conciseness,
                        instruction_following=verdict.instruction_following,
                        overall=verdict.overall,
                        reason=verdict.reason,
                        raw_judge_output=verdict.raw,
                        parse_error=verdict.parse_error,
                    )
                )


async def start_run_background(run_id: int) -> None:
    """Async helper used by `BackgroundTasks` to drive a run to completion."""
    runner = BenchmarkRunner()
    await runner.run(run_id)
