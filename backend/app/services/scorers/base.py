"""Shared dataclasses for benchmark scorers."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class ScorerContext:
    """Everything a scorer needs to evaluate a single model output."""

    task_type: str
    benchmark: str  # e.g. "mmlu", "hellaswag", "custom-mcq"
    candidate: Optional[str]
    reference: Optional[str]
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BenchmarkScoreResult:
    """Output of a scorer. Mirrors fields on the BenchmarkScore SQL row."""

    scorer: str
    predicted: Optional[str] = None
    expected: Optional[str] = None
    is_correct: Optional[bool] = None
    score: Optional[float] = None
    parse_error: Optional[str] = None
    raw_extract: Optional[str] = None
