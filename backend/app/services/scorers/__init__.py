"""Deterministic / traditional benchmark scorers.

Each scorer turns a `(reference, candidate)` pair (plus task-specific metadata
from the example) into a `BenchmarkScoreResult`. Scorers are dispatched by
`task_type` (set on each example via `metadata.task_type`).
"""
from __future__ import annotations

from typing import Callable, Dict, Optional

from .base import BenchmarkScoreResult, ScorerContext
from .code import score_code
from .mcq import score_mcq

Scorer = Callable[[ScorerContext], BenchmarkScoreResult]

_REGISTRY: Dict[str, Scorer] = {
    "mcq": score_mcq,
    "code": score_code,
}


def get_scorer(task_type: str) -> Optional[Scorer]:
    return _REGISTRY.get(task_type.lower()) if task_type else None


def supported_task_types() -> list[str]:
    return sorted(_REGISTRY.keys())


__all__ = [
    "BenchmarkScoreResult",
    "ScorerContext",
    "get_scorer",
    "supported_task_types",
]
