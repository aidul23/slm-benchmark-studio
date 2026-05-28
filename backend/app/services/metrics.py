"""Aggregation helpers for run-level metrics."""
from __future__ import annotations

from statistics import mean
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from sqlmodel import Session, select

from ..models.benchmark_run import BenchmarkRun, EvaluationMode, resolve_evaluation_mode
from ..models.benchmark_score import BenchmarkScore
from ..models.example import DatasetExample
from ..models.judge_score import JudgeScore
from ..models.model_output import ModelOutput
from ..schemas.result import (
    BenchmarkBreakdown,
    BenchmarkModelStat,
    BenchmarkScoreRead,
    BenchmarkSubjectBreakdown,
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

        benchmarks = [r.benchmark for r in model_rows if r.benchmark is not None]
        scored_benchmarks = [b for b in benchmarks if b.is_correct is not None]
        benchmark_correct = sum(1 for b in scored_benchmarks if b.is_correct)
        benchmark_parse_errors = sum(1 for b in benchmarks if b.parse_error)
        benchmark_accuracy: Optional[float] = None
        if scored_benchmarks:
            benchmark_accuracy = benchmark_correct / len(scored_benchmarks)

        # Per-benchmark split (MMLU vs HellaSwag vs …).
        by_benchmark = _split_by_benchmark(benchmarks)

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
                benchmark_count=len(scored_benchmarks),
                benchmark_correct=benchmark_correct,
                benchmark_accuracy=benchmark_accuracy,
                benchmark_parse_error_count=benchmark_parse_errors,
                by_benchmark=by_benchmark,
            )
        )
    summaries.sort(
        key=lambda s: (
            s.benchmark_accuracy if s.benchmark_accuracy is not None else -1,
            s.avg_overall or 0,
        ),
        reverse=True,
    )
    return summaries


def _split_by_benchmark(benchmarks: List[BenchmarkScoreRead]) -> List[BenchmarkBreakdown]:
    """Group BenchmarkScoreRead rows by their `benchmark` field into breakdown rows."""
    buckets: Dict[str, List[BenchmarkScoreRead]] = {}
    for entry in benchmarks:
        key = (entry.benchmark or "custom").strip().lower() or "custom"
        buckets.setdefault(key, []).append(entry)
    out: List[BenchmarkBreakdown] = []
    for name, entries in buckets.items():
        scored = [e for e in entries if e.is_correct is not None]
        correct = sum(1 for e in scored if e.is_correct)
        incorrect = sum(1 for e in scored if e.is_correct is False)
        parse_err = sum(1 for e in entries if e.parse_error)
        accuracy = (correct / len(scored)) if scored else None
        task_type = next((e.task_type for e in entries if e.task_type), None)
        out.append(
            BenchmarkBreakdown(
                benchmark=name,
                task_type=task_type,
                count=len(scored),
                correct=correct,
                incorrect=incorrect,
                parse_error_count=parse_err,
                accuracy=accuracy,
            )
        )
    out.sort(key=lambda b: b.benchmark)
    return out


def _pool_benchmarks(rows: List[ResultRow]) -> List[BenchmarkBreakdown]:
    """All-models pooled breakdown across every benchmark touched in `rows`."""
    pool: Dict[str, List[BenchmarkScoreRead]] = {}
    for row in rows:
        if row.benchmark is None:
            continue
        key = (row.benchmark.benchmark or "custom").strip().lower() or "custom"
        pool.setdefault(key, []).append(row.benchmark)
    flat: List[BenchmarkScoreRead] = []
    for bucket in pool.values():
        flat.extend(bucket)
    return _split_by_benchmark(flat)


def _benchmark_by_model(rows: List[ResultRow]) -> List[BenchmarkModelStat]:
    """One row per (benchmark, model) for grouped bar charts."""
    cells: Dict[tuple, List[BenchmarkScoreRead]] = {}
    for row in rows:
        if row.benchmark is None:
            continue
        bench = (row.benchmark.benchmark or "custom").strip().lower() or "custom"
        cells.setdefault((bench, row.model_name), []).append(row.benchmark)

    out: List[BenchmarkModelStat] = []
    for (bench, model), entries in cells.items():
        scored = [e for e in entries if e.is_correct is not None]
        correct = sum(1 for e in scored if e.is_correct)
        accuracy = (correct / len(scored)) if scored else None
        out.append(
            BenchmarkModelStat(
                benchmark=bench,
                model_name=model,
                count=len(scored),
                correct=correct,
                accuracy=accuracy,
            )
        )
    out.sort(key=lambda s: (s.benchmark, -(s.accuracy or 0)))
    return out


def _subject_breakdown(rows: List[ResultRow]) -> Dict[str, List[BenchmarkSubjectBreakdown]]:
    """Per (benchmark → subject) accuracy, pooled across models.

    Uses the existing `category` field on the result row, which our benchmark
    loaders populate with MMLU's subject (e.g. `abstract_algebra`) and
    HellaSwag's activity label.
    """
    buckets: Dict[tuple, List[BenchmarkScoreRead]] = {}
    for row in rows:
        if row.benchmark is None or row.benchmark.is_correct is None:
            continue
        bench = (row.benchmark.benchmark or "custom").strip().lower() or "custom"
        subject = (row.category or "uncategorized").strip() or "uncategorized"
        buckets.setdefault((bench, subject), []).append(row.benchmark)

    grouped: Dict[str, List[BenchmarkSubjectBreakdown]] = {}
    for (bench, subject), entries in buckets.items():
        correct = sum(1 for e in entries if e.is_correct)
        accuracy = correct / len(entries) if entries else None
        grouped.setdefault(bench, []).append(
            BenchmarkSubjectBreakdown(
                benchmark=bench,
                subject=subject,
                count=len(entries),
                correct=correct,
                accuracy=accuracy,
            )
        )
    for bench in grouped:
        grouped[bench].sort(key=lambda s: (-(s.accuracy or 0), s.subject))
    return grouped


def fetch_result_rows(session: Session, run_id: int) -> List[ResultRow]:
    """Return rich result rows joining example, output, judge, and benchmark data."""
    stmt = (
        select(ModelOutput, DatasetExample, JudgeScore, BenchmarkScore)
        .join(DatasetExample, DatasetExample.id == ModelOutput.example_id)
        .join(JudgeScore, JudgeScore.model_output_id == ModelOutput.id, isouter=True)
        .join(BenchmarkScore, BenchmarkScore.model_output_id == ModelOutput.id, isouter=True)
        .where(ModelOutput.run_id == run_id)
    )
    results = session.exec(stmt).all()

    rows: List[ResultRow] = []
    for output, example, judge, benchmark in results:
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

        benchmark_read: Optional[BenchmarkScoreRead] = None
        if benchmark is not None:
            benchmark_read = BenchmarkScoreRead(
                benchmark=benchmark.benchmark,
                task_type=benchmark.task_type,
                scorer=benchmark.scorer,
                predicted=benchmark.predicted,
                expected=benchmark.expected,
                is_correct=benchmark.is_correct,
                score=benchmark.score,
                parse_error=benchmark.parse_error,
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
                benchmark=benchmark_read,
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
        benchmarks=_pool_benchmarks(rows),
        benchmark_by_model=_benchmark_by_model(rows),
        benchmark_subjects=_subject_breakdown(rows),
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

        benchmarks = [r.benchmark for r in bucket if r.benchmark is not None]
        scored = [b for b in benchmarks if b.is_correct is not None]
        accuracy: Optional[float] = None
        if scored:
            accuracy = sum(1 for b in scored if b.is_correct) / len(scored)

        entry = {
            "count": float(len(bucket)),
            "avg_overall": float(avg_overall) if avg_overall is not None else 0.0,
            "avg_latency_ms": float(avg_latency) if avg_latency is not None else 0.0,
            "benchmark_count": float(len(scored)),
            "benchmark_accuracy": float(accuracy) if accuracy is not None else 0.0,
        }
        out[key] = entry
    return out


def build_insights_overview(session: Session, participant=None) -> InsightsOverview:
    """High-level dashboard metrics across runs visible to the caller."""
    from ..models.dataset import Dataset  # local import to avoid circular
    from ..workshop import ParticipantContext, filter_datasets_query, filter_runs_query

    if participant is None:
        participant = ParticipantContext(key=None, scoped=False)

    dataset_query = select(Dataset)
    dataset_query = filter_datasets_query(participant, dataset_query)
    total_datasets = len(session.exec(dataset_query).all())

    runs_query = select(BenchmarkRun).order_by(BenchmarkRun.created_at.desc())
    runs_query = filter_runs_query(participant, runs_query)
    runs = session.exec(runs_query).all()
    total_runs = len(runs)
    run_mode_by_id: Dict[int, str] = {}
    for run in runs:
        if run.id is not None:
            run_mode_by_id[run.id] = resolve_evaluation_mode(run).value

    rows: List[ResultRow] = []
    for run in runs:
        if run.id is None:
            continue
        rows.extend(fetch_result_rows(session, run.id))

    judge_rows = [r for r in rows if run_mode_by_id.get(r.run_id) == EvaluationMode.JUDGE.value]
    benchmark_rows = [r for r in rows if run_mode_by_id.get(r.run_id) == EvaluationMode.BENCHMARK.value]

    judge_summaries = _build_summary(judge_rows)
    benchmark_summaries = _build_summary(benchmark_rows)
    all_summaries = _build_summary(rows)

    best_model = None
    fastest_model = None
    best_benchmark_model = None
    if judge_summaries:
        scored = [s for s in judge_summaries if s.avg_overall is not None]
        if scored:
            top = max(scored, key=lambda s: s.avg_overall or 0)
            best_model = {"model_name": top.model_name, "avg_overall": top.avg_overall}
    if all_summaries:
        timed = [s for s in all_summaries if s.avg_latency_ms is not None]
        if timed:
            fastest = min(timed, key=lambda s: s.avg_latency_ms or float("inf"))
            fastest_model = {"model_name": fastest.model_name, "avg_latency_ms": fastest.avg_latency_ms}
    if benchmark_summaries:
        benched = [s for s in benchmark_summaries if s.benchmark_accuracy is not None and s.benchmark_count > 0]
        if benched:
            top_bench = max(benched, key=lambda s: s.benchmark_accuracy or 0)
            best_benchmark_model = {
                "model_name": top_bench.model_name,
                "benchmark_accuracy": top_bench.benchmark_accuracy,
                "benchmark_count": top_bench.benchmark_count,
            }

    recent_runs: List[Dict[str, float]] = []
    for run in runs[:8]:
        recent_runs.append(
            {
                "id": run.id,
                "name": run.name,
                "status": run.status.value if hasattr(run.status, "value") else str(run.status),
                "evaluation_mode": resolve_evaluation_mode(run).value,
                "created_at": run.created_at.isoformat() if run.created_at else None,
                "progress_done": run.progress_done,
                "progress_total": run.progress_total,
            }
        )

    benchmarks_pool = _pool_benchmarks(benchmark_rows)
    benchmark_by_model = _benchmark_by_model(benchmark_rows)

    best_per_benchmark: List[Dict[str, Any]] = []
    for bench_row in benchmarks_pool:
        cells = [
            stat for stat in benchmark_by_model
            if stat.benchmark == bench_row.benchmark and stat.accuracy is not None and stat.count > 0
        ]
        if not cells:
            continue
        top = max(cells, key=lambda s: s.accuracy or 0)
        best_per_benchmark.append(
            {
                "benchmark": bench_row.benchmark,
                "model_name": top.model_name,
                "accuracy": top.accuracy,
                "count": top.count,
            }
        )

    return InsightsOverview(
        total_datasets=total_datasets,
        total_runs=total_runs,
        total_outputs=len(rows),
        best_model_by_overall=best_model,
        fastest_model_by_latency=fastest_model,
        best_model_by_benchmark=best_benchmark_model,
        best_per_benchmark=best_per_benchmark,
        recent_runs=recent_runs,
        by_model=judge_summaries,
        benchmarks=benchmarks_pool,
        benchmark_by_model=benchmark_by_model,
        benchmark_models=benchmark_summaries,
        all_models=all_summaries,
    )


__all__ = [
    "build_run_summary",
    "build_insights_overview",
    "fetch_result_rows",
]
