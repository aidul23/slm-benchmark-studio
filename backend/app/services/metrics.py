"""Aggregation helpers for run-level metrics."""
from __future__ import annotations

from statistics import mean
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from sqlmodel import Session, select

from ..models.benchmark_run import BenchmarkRun
from ..models.example import DatasetExample
from ..models.judge_score import JudgeScore
from ..models.model_output import ModelOutput
from ..schemas.result import (
    InsightsOverview,
    JudgeScoreRead,
    ModelSummary,
    ResultRow,
    RunSummary,
)


def _percentile(values: Sequence[float], pct: float) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    k = (len(ordered) - 1) * pct
    lo = int(k)
    hi = min(lo + 1, len(ordered) - 1)
    weight = k - lo
    return float(ordered[lo] * (1 - weight) + ordered[hi] * weight)


def _avg(values: Iterable[Optional[float]]) -> Optional[float]:
    filtered = [float(v) for v in values if v is not None]
    if not filtered:
        return None
    return float(mean(filtered))


def _build_summary(rows: List[ResultRow]) -> List[ModelSummary]:
    grouped: Dict[str, List[ResultRow]] = {}
    for row in rows:
        grouped.setdefault(row.model_name, []).append(row)

    summaries: List[ModelSummary] = []
    for model_name, model_rows in grouped.items():
        latencies = [r.latency_ms for r in model_rows if r.latency_ms is not None]
        tps = [r.tokens_per_second for r in model_rows if r.tokens_per_second is not None]
        judges = [r.judge for r in model_rows if r.judge is not None]
        error_count = sum(1 for r in model_rows if r.error)
        parse_errors = sum(1 for j in judges if j.parse_error)
        summaries.append(
            ModelSummary(
                model_name=model_name,
                count=len(model_rows),
                error_count=error_count,
                parse_error_count=parse_errors,
                avg_latency_ms=_avg(latencies),
                p50_latency_ms=_percentile(latencies, 0.5),
                p95_latency_ms=_percentile(latencies, 0.95),
                avg_tokens_per_second=_avg(tps),
                avg_correctness=_avg(j.correctness for j in judges),
                avg_factuality=_avg(j.factuality for j in judges),
                avg_completeness=_avg(j.completeness for j in judges),
                avg_conciseness=_avg(j.conciseness for j in judges),
                avg_instruction_following=_avg(j.instruction_following for j in judges),
                avg_overall=_avg(j.overall for j in judges),
            )
        )
    summaries.sort(key=lambda s: (s.avg_overall or 0), reverse=True)
    return summaries


def fetch_result_rows(session: Session, run_id: int) -> List[ResultRow]:
    """Return rich result rows joining example, output, and judge data."""
    stmt = (
        select(ModelOutput, DatasetExample, JudgeScore)
        .join(DatasetExample, DatasetExample.id == ModelOutput.example_id)
        .join(JudgeScore, JudgeScore.model_output_id == ModelOutput.id, isouter=True)
        .where(ModelOutput.run_id == run_id)
    )
    results = session.exec(stmt).all()

    rows: List[ResultRow] = []
    for output, example, judge in results:
        judge_read: Optional[JudgeScoreRead] = None
        if judge is not None:
            judge_read = JudgeScoreRead(
                judge_model=judge.judge_model,
                correctness=judge.correctness,
                factuality=judge.factuality,
                completeness=judge.completeness,
                conciseness=judge.conciseness,
                instruction_following=judge.instruction_following,
                overall=judge.overall,
                reason=judge.reason,
                parse_error=judge.parse_error,
                human_score=judge.human_score,
                human_notes=judge.human_notes,
                accepted_judge_score=judge.accepted_judge_score,
            )

        rows.append(
            ResultRow(
                output_id=output.id or 0,
                run_id=output.run_id,
                example_id=output.example_id,
                external_id=example.external_id,
                model_name=output.model_name,
                input=output.input,
                reference=output.reference,
                output=output.output,
                rendered_prompt=output.rendered_prompt,
                latency_ms=output.latency_ms,
                tokens_per_second=output.tokens_per_second,
                prompt_eval_count=output.prompt_eval_count,
                eval_count=output.eval_count,
                category=example.category,
                difficulty=example.difficulty,
                error=output.error,
                judge=judge_read,
            )
        )
    return rows


def build_run_summary(session: Session, run_id: int, *, worst_limit: int = 10) -> RunSummary:
    rows = fetch_result_rows(session, run_id)
    by_model = _build_summary(rows)

    by_category = _slice_average(rows, lambda r: r.category)
    by_difficulty = _slice_average(rows, lambda r: r.difficulty)

    scored_rows = [r for r in rows if r.judge and r.judge.overall is not None]
    scored_rows.sort(key=lambda r: r.judge.overall if r.judge and r.judge.overall is not None else 5)
    worst = scored_rows[:worst_limit]

    unique_examples = {r.example_id for r in rows}
    return RunSummary(
        run_id=run_id,
        total_examples=len(unique_examples),
        total_outputs=len(rows),
        by_model=by_model,
        by_category=by_category,
        by_difficulty=by_difficulty,
        worst_examples=worst,
    )


def _slice_average(rows: List[ResultRow], key_fn) -> Dict[str, Dict[str, float]]:
    buckets: Dict[str, List[ResultRow]] = {}
    for row in rows:
        key = key_fn(row) or "uncategorized"
        buckets.setdefault(key, []).append(row)

    out: Dict[str, Dict[str, float]] = {}
    for key, bucket in buckets.items():
        judges = [r.judge for r in bucket if r.judge is not None]
        avg_overall = _avg(j.overall for j in judges)
        avg_latency = _avg(r.latency_ms for r in bucket)
        out[key] = {
            "count": float(len(bucket)),
            "avg_overall": float(avg_overall) if avg_overall is not None else 0.0,
            "avg_latency_ms": float(avg_latency) if avg_latency is not None else 0.0,
        }
    return out


def build_insights_overview(session: Session) -> InsightsOverview:
    """High-level dashboard metrics across all runs."""
    from ..models.dataset import Dataset  # local import to avoid circular

    total_datasets = len(session.exec(select(Dataset)).all())
    runs = session.exec(select(BenchmarkRun).order_by(BenchmarkRun.created_at.desc())).all()
    total_runs = len(runs)

    rows: List[ResultRow] = []
    for run in runs:
        if run.id is None:
            continue
        rows.extend(fetch_result_rows(session, run.id))

    summaries = _build_summary(rows)

    best_model = None
    fastest_model = None
    if summaries:
        scored = [s for s in summaries if s.avg_overall is not None]
        if scored:
            top = max(scored, key=lambda s: s.avg_overall or 0)
            best_model = {"model_name": top.model_name, "avg_overall": top.avg_overall}
        timed = [s for s in summaries if s.avg_latency_ms is not None]
        if timed:
            fastest = min(timed, key=lambda s: s.avg_latency_ms or float("inf"))
            fastest_model = {"model_name": fastest.model_name, "avg_latency_ms": fastest.avg_latency_ms}

    recent_runs: List[Dict[str, float]] = []
    for run in runs[:8]:
        recent_runs.append(
            {
                "id": run.id,
                "name": run.name,
                "status": run.status.value if hasattr(run.status, "value") else str(run.status),
                "created_at": run.created_at.isoformat() if run.created_at else None,
                "progress_done": run.progress_done,
                "progress_total": run.progress_total,
            }
        )

    return InsightsOverview(
        total_datasets=total_datasets,
        total_runs=total_runs,
        total_outputs=len(rows),
        best_model_by_overall=best_model,
        fastest_model_by_latency=fastest_model,
        recent_runs=recent_runs,
        by_model=summaries,
    )


__all__ = [
    "build_run_summary",
    "build_insights_overview",
    "fetch_result_rows",
]
