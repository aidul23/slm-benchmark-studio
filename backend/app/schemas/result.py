"""Result and insights schemas."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class JudgeScoreRead(BaseModel):
    judge_model: Optional[str] = None
    correctness: Optional[float] = None
    factuality: Optional[float] = None
    completeness: Optional[float] = None
    conciseness: Optional[float] = None
    instruction_following: Optional[float] = None
    overall: Optional[float] = None
    reason: Optional[str] = None
    parse_error: Optional[str] = None
    human_score: Optional[float] = None
    human_notes: Optional[str] = None
    accepted_judge_score: Optional[bool] = None


class BenchmarkScoreRead(BaseModel):
    benchmark: Optional[str] = None
    task_type: Optional[str] = None
    scorer: Optional[str] = None
    predicted: Optional[str] = None
    expected: Optional[str] = None
    is_correct: Optional[bool] = None
    score: Optional[float] = None
    parse_error: Optional[str] = None


class BenchmarkBreakdown(BaseModel):
    """Per-benchmark aggregate (used at model, run, and insights level)."""

    benchmark: str
    task_type: Optional[str] = None
    count: int = 0
    correct: int = 0
    incorrect: int = 0
    parse_error_count: int = 0
    accuracy: Optional[float] = None


class BenchmarkSubjectBreakdown(BaseModel):
    """Per-subject (e.g. MMLU subject, HellaSwag activity) aggregate within a benchmark."""

    benchmark: str
    subject: str
    count: int = 0
    correct: int = 0
    accuracy: Optional[float] = None


class ResultRow(BaseModel):
    output_id: int
    run_id: int
    example_id: int
    external_id: Optional[str] = None
    model_name: str
    input: str
    reference: Optional[str] = None
    output: Optional[str] = None
    rendered_prompt: Optional[str] = None
    latency_ms: Optional[float] = None
    tokens_per_second: Optional[float] = None
    prompt_eval_count: Optional[int] = None
    eval_count: Optional[int] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    error: Optional[str] = None
    judge: Optional[JudgeScoreRead] = None
    benchmark: Optional[BenchmarkScoreRead] = None


class ModelSummary(BaseModel):
    model_name: str
    count: int = 0
    error_count: int = 0
    parse_error_count: int = 0
    avg_latency_ms: Optional[float] = None
    p50_latency_ms: Optional[float] = None
    p95_latency_ms: Optional[float] = None
    avg_tokens_per_second: Optional[float] = None
    avg_correctness: Optional[float] = None
    avg_factuality: Optional[float] = None
    avg_completeness: Optional[float] = None
    avg_conciseness: Optional[float] = None
    avg_instruction_following: Optional[float] = None
    avg_overall: Optional[float] = None
    # Pooled benchmark aggregates across every benchmark this model touched.
    benchmark_count: int = 0
    benchmark_correct: int = 0
    benchmark_accuracy: Optional[float] = None
    benchmark_parse_error_count: int = 0
    # Per-benchmark breakdowns (MMLU vs HellaSwag vs …). Empty if the model
    # never participated in a deterministic-scoring task.
    by_benchmark: List[BenchmarkBreakdown] = Field(default_factory=list)


class BenchmarkModelStat(BaseModel):
    """One (benchmark, model) cell — used for grouped charts."""

    benchmark: str
    model_name: str
    count: int = 0
    correct: int = 0
    accuracy: Optional[float] = None


class RunSummary(BaseModel):
    run_id: int
    total_examples: int
    total_outputs: int
    by_model: List[ModelSummary] = Field(default_factory=list)
    by_category: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    by_difficulty: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    worst_examples: List[ResultRow] = Field(default_factory=list)
    # Top-level: every benchmark this run touched, pooled across all models.
    benchmarks: List[BenchmarkBreakdown] = Field(default_factory=list)
    # Per-benchmark, per-model accuracy cell (for grouped bar charts).
    benchmark_by_model: List[BenchmarkModelStat] = Field(default_factory=list)
    # Per-benchmark, per-subject accuracy (e.g. MMLU subjects).
    benchmark_subjects: Dict[str, List[BenchmarkSubjectBreakdown]] = Field(default_factory=dict)


class InsightsOverview(BaseModel):
    total_datasets: int
    total_runs: int
    total_outputs: int
    best_model_by_overall: Optional[Dict[str, Any]] = None
    fastest_model_by_latency: Optional[Dict[str, Any]] = None
    best_model_by_benchmark: Optional[Dict[str, Any]] = None
    best_per_benchmark: List[Dict[str, Any]] = Field(default_factory=list)
    recent_runs: List[Dict[str, Any]] = Field(default_factory=list)
    by_model: List[ModelSummary] = Field(default_factory=list)
    benchmarks: List[BenchmarkBreakdown] = Field(default_factory=list)
    benchmark_by_model: List[BenchmarkModelStat] = Field(default_factory=list)
    benchmark_models: List[ModelSummary] = Field(
        default_factory=list,
        description="Model summaries pooled from benchmark-mode runs only (for accuracy vs latency charts).",
    )
    all_models: List[ModelSummary] = Field(
        default_factory=list,
        description="Model summaries pooled across all runs (for shared latency charts).",
    )


class HumanReviewUpdate(BaseModel):
    human_score: Optional[float] = None
    human_notes: Optional[str] = None
    accepted_judge_score: Optional[bool] = None
