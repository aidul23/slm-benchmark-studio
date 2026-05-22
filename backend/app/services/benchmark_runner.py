"""Orchestrates the Data → Models → Judge pipeline for a benchmark run."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlmodel import select
from tqdm import tqdm

from ..config import get_settings
from ..database import session_scope
from ..models.benchmark_run import BenchmarkRun, RunStatus
from ..models.example import DatasetExample
from ..models.judge_score import JudgeScore
from ..models.model_output import ModelOutput
from ..models.prompt_template import PromptTemplate
from . import prompt_renderer
from .export_service import run_results_to_csv
from .judge_runner import JudgeRunner
from .ollama_client import OllamaClient, OllamaError
from .providers import get_provider


logger = logging.getLogger(__name__)


@dataclass
class _ExampleSnapshot:
    """Plain-Python snapshot of an example so we can use it after a session closes."""

    id: int
    external_id: Optional[str]
    input: str
    reference: Optional[str]
    category: Optional[str]
    difficulty: Optional[str]


class BenchmarkRunner:
    """Runs a benchmark end-to-end.

    Designed to be invoked via FastAPI background task. Each model/example error is captured
    so a single failure never breaks the whole run. Progress is written both to the database
    (for the UI) and to a tqdm bar on the backend's terminal.
    """

    def __init__(self, ollama: Optional[OllamaClient] = None) -> None:
        # `self.ollama` is kept for the generation phase (Ollama is the only
        # generator today). The judge phase looks up its provider per run.
        self.ollama = ollama or OllamaClient()
        # `judge_api_key` is set per-run via `run(...)` and lives only in
        # memory for the duration of the run.
        self._judge_api_key: Optional[str] = None

    async def run(self, run_id: int, judge_api_key: Optional[str] = None) -> None:
        self._judge_api_key = judge_api_key
        try:
            await self._execute(run_id)
        except Exception as exc:  # noqa: BLE001  keep the worker process alive on any error
            logger.exception("Benchmark run %s crashed", run_id)
            with session_scope() as session:
                run = session.get(BenchmarkRun, run_id)
                if run is not None:
                    run.status = RunStatus.FAILED
                    run.error = str(exc)
                    run.current_phase = "failed"
                    run.current_activity = f"Error: {exc}"
                    run.completed_at = datetime.utcnow()
                    session.add(run)
        finally:
            # Drop the API key from memory the moment the run is done.
            self._judge_api_key = None

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
            judge_provider_key = (run.judge_provider or "ollama").strip().lower()
            judge_criteria: Optional[List[str]] = None
            if run.judge_criteria_json:
                try:
                    raw = json.loads(run.judge_criteria_json)
                    if isinstance(raw, list):
                        judge_criteria = [c for c in raw if isinstance(c, str)]
                except json.JSONDecodeError:
                    judge_criteria = None
            judge_system_prompt = run.judge_system_prompt
            judge_user_template = run.judge_user_template
            run_name = run.name

            template = session.get(PromptTemplate, run.prompt_template_id)
            if template is None:
                run.status = RunStatus.FAILED
                run.error = "Prompt template not found"
                run.current_phase = "failed"
                run.current_activity = "Prompt template missing"
                run.completed_at = datetime.utcnow()
                session.add(run)
                return

            example_rows = session.exec(
                select(DatasetExample).where(DatasetExample.dataset_id == run.dataset_id)
            ).all()
            if not example_rows:
                run.status = RunStatus.FAILED
                run.error = "Dataset has no examples"
                run.current_phase = "failed"
                run.current_activity = "Dataset is empty"
                run.completed_at = datetime.utcnow()
                session.add(run)
                return

            examples: List[_ExampleSnapshot] = [
                _ExampleSnapshot(
                    id=row.id or 0,
                    external_id=row.external_id,
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
            run.current_phase = "generation"
            run.current_activity = "Starting generation phase…"
            run.export_path = None
            session.add(run)

        temperature = float(config.get("temperature", 0.2))
        max_tokens = int(config.get("max_tokens", 512))

        logger.info(
            "Run #%s '%s' started: %d models × %d examples = %d outputs",
            run_id,
            run_name,
            len(models),
            len(examples),
            len(models) * len(examples),
        )

        # ---- Phase 2: generation across every (model, example) pair.
        pairs = [(m, e) for m in models for e in examples]
        pbar = tqdm(
            total=len(pairs),
            desc=f"[run {run_id}] generation",
            unit="output",
            file=sys.stdout,
            dynamic_ncols=True,
            leave=True,
        )
        try:
            for model_name, example in pairs:
                short_id = example.external_id or f"#{example.id}"
                activity = f"generation · {model_name} · {short_id}"
                pbar.set_postfix_str(f"{model_name} · {short_id}", refresh=False)
                self._update_activity(run_id, phase="generation", activity=activity)
                await self._run_single(
                    run_id=run_id,
                    model_name=model_name,
                    example=example,
                    template_snapshot=template_snapshot,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                pbar.update(1)
        finally:
            pbar.close()

        # ---- Phase 3: optional judge phase.
        if judge_model:
            await self._run_judge_phase(
                run_id=run_id,
                judge_model=judge_model,
                judge_provider_key=judge_provider_key,
                judge_criteria=judge_criteria,
                judge_system_prompt=judge_system_prompt,
                judge_user_template=judge_user_template,
            )

        # ---- Phase 4: finalize + auto-export.
        self._update_activity(run_id, phase="finalizing", activity="Writing CSV export…")
        export_path = self._write_export(run_id, run_name)

        with session_scope() as session:
            run = session.get(BenchmarkRun, run_id)
            if run is not None:
                run.status = RunStatus.COMPLETED
                run.completed_at = datetime.utcnow()
                run.current_phase = "done"
                run.current_activity = "Completed"
                run.export_path = export_path
                session.add(run)

        logger.info("Run #%s completed. Export: %s", run_id, export_path or "(none)")

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

    async def _run_judge_phase(
        self,
        *,
        run_id: int,
        judge_model: str,
        judge_provider_key: str = "ollama",
        judge_criteria: Optional[List[str]] = None,
        judge_system_prompt: Optional[str] = None,
        judge_user_template: Optional[str] = None,
    ) -> None:
        """Score every generated output that does not yet have a judge entry."""
        provider = get_provider(judge_provider_key)
        if provider is None:
            raise OllamaError(f"Unknown judge provider '{judge_provider_key}'")
        if provider.info.requires_api_key and not self._judge_api_key:
            raise OllamaError(
                f"{provider.info.name} judge requires an API key but none was supplied. "
                "Open the run, enter your key, and restart it."
            )
        judge = JudgeRunner(
            provider,
            api_key=self._judge_api_key,
            criteria=judge_criteria,
            system_prompt=judge_system_prompt,
            user_template=judge_user_template,
        )

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
                        "model_name": item.model_name,
                        "external_id": example.external_id if example else None,
                        "example_id": item.example_id,
                        "input": item.input,
                        "reference": item.reference,
                        "output": item.output,
                        "category": example.category if example else None,
                        "difficulty": example.difficulty if example else None,
                    }
                )

        if not jobs:
            return

        self._update_activity(run_id, phase="judging", activity=f"Judging with {judge_model}…")
        pbar = tqdm(
            total=len(jobs),
            desc=f"[run {run_id}] judging",
            unit="score",
            file=sys.stdout,
            dynamic_ncols=True,
            leave=True,
        )
        try:
            for job in jobs:
                short_id = job["external_id"] or f"#{job['example_id']}"
                activity = f"judging · {job['model_name']} · {short_id} → {judge_model}"
                pbar.set_postfix_str(f"{job['model_name']} · {short_id}", refresh=False)
                self._update_activity(run_id, phase="judging", activity=activity)

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
                pbar.update(1)
        finally:
            pbar.close()

    @staticmethod
    def _update_activity(run_id: int, *, phase: str, activity: str) -> None:
        """Mirror tqdm state to the database so the frontend can show it."""
        with session_scope() as session:
            run = session.get(BenchmarkRun, run_id)
            if run is not None:
                run.current_phase = phase
                run.current_activity = activity
                session.add(run)

    @staticmethod
    def _write_export(run_id: int, run_name: str) -> Optional[str]:
        """Write a CSV with every output + judge score to the exports directory."""
        settings = get_settings()
        exports_dir = Path(settings.exports_dir).expanduser()
        if not exports_dir.is_absolute():
            exports_dir = (Path.cwd() / exports_dir).resolve()
        try:
            exports_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            logger.warning("Could not create exports dir %s: %s", exports_dir, exc)
            return None

        with session_scope() as session:
            try:
                payload = run_results_to_csv(session, run_id)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to build CSV for run %s: %s", run_id, exc)
                return None

        if not payload:
            return None

        safe_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in run_name)[:48]
        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        filename = f"run_{run_id}_{safe_name or 'run'}_{timestamp}.csv"
        path = exports_dir / filename
        try:
            path.write_bytes(payload)
        except OSError as exc:
            logger.warning("Failed to write export %s: %s", path, exc)
            return None
        return str(path)


async def start_run_background(run_id: int, judge_api_key: Optional[str] = None) -> None:
    """Async helper used by `BackgroundTasks` to drive a run to completion.

    `judge_api_key` is forwarded only to the in-memory `BenchmarkRunner` and is
    cleared from memory the moment the run finishes.
    """
    runner = BenchmarkRunner()
    await runner.run(run_id, judge_api_key=judge_api_key)
