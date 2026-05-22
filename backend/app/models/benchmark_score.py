"""Benchmark score entity for traditional / deterministic benchmarks (MMLU, HellaSwag, …)."""
from __future__ import annotations

from typing import Optional

from sqlmodel import Field, SQLModel


class BenchmarkScore(SQLModel, table=True):
    """One row per (model output, traditional benchmark scorer) pair.

    Parallel to `JudgeScore` but for deterministic scorers (multiple-choice letter
    matching today; later extendable to pass@k / exact-match / token-F1 / etc.).
    A model output may have both a `JudgeScore` and a `BenchmarkScore`.
    """

    __tablename__ = "benchmark_scores"

    id: Optional[int] = Field(default=None, primary_key=True)
    model_output_id: int = Field(foreign_key="model_outputs.id", index=True, unique=True)

    benchmark: str = Field(index=True, description="e.g. 'mmlu', 'hellaswag', 'custom-mcq'")
    task_type: str = Field(index=True, description="e.g. 'mcq', 'open_qa', 'code', 'math'")
    scorer: str = Field(description="Scorer key that produced this row, e.g. 'mcq_letter'")

    predicted: Optional[str] = Field(default=None, description="Parsed prediction (letter for MCQ)")
    expected: Optional[str] = Field(default=None, description="Gold answer (letter for MCQ)")
    is_correct: Optional[bool] = Field(default=None, index=True)
    # Continuous score in [0, 1]. For MCQ this is 1.0 if correct else 0.0. Kept
    # generic so future scorers (pass@k, F1, ROUGE-L) can populate it too.
    score: Optional[float] = Field(default=None)

    parse_error: Optional[str] = Field(default=None)
    raw_extract: Optional[str] = Field(default=None, description="Short snippet from the model output the parser keyed on")
