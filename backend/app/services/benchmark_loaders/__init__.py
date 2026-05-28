"""Loaders that turn public benchmarks (MMLU, HellaSwag, …) into Dataset rows.

Each loader returns `ParsedExample` instances compatible with the existing
JSONL upload pipeline, so downstream code (DB writes, prompt rendering, runner)
does not need to special-case benchmarks.
"""
from __future__ import annotations

from typing import Callable, Dict, List, Optional

from .base import BenchmarkLoaderInfo, BenchmarkLoadResult, LoaderRequest
from .hellaswag import HELLASWAG_INFO, load_hellaswag
from .humaneval import HUMANEVAL_INFO, load_humaneval
from .mmlu import MMLU_INFO, load_mmlu

Loader = Callable[[LoaderRequest], BenchmarkLoadResult]

_REGISTRY: Dict[str, Loader] = {
    "mmlu": load_mmlu,
    "hellaswag": load_hellaswag,
    "humaneval": load_humaneval,
}

_CATALOG: List[BenchmarkLoaderInfo] = [MMLU_INFO, HELLASWAG_INFO, HUMANEVAL_INFO]


def get_loader(key: str) -> Optional[Loader]:
    return _REGISTRY.get(key.lower()) if key else None


def catalog() -> List[BenchmarkLoaderInfo]:
    return list(_CATALOG)


__all__ = [
    "BenchmarkLoadResult",
    "BenchmarkLoaderInfo",
    "LoaderRequest",
    "catalog",
    "get_loader",
]
