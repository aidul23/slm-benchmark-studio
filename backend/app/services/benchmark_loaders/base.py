"""Shared types + helpers for benchmark loaders."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from ...utils.jsonl import ParsedExample


@dataclass
class BenchmarkSubset:
    """A selectable configuration of a benchmark (e.g. MMLU subject)."""

    key: str
    label: str
    description: Optional[str] = None


@dataclass
class BenchmarkLoaderInfo:
    """Metadata exposed via the API so the UI can render an import form."""

    key: str
    name: str
    description: str
    task_type: str  # e.g. "mcq"
    default_split: str
    splits: List[str] = field(default_factory=list)
    subsets: List[BenchmarkSubset] = field(default_factory=list)
    default_subset: Optional[str] = None
    suggested_limit: int = 100
    max_limit: int = 1000
    docs_url: Optional[str] = None


@dataclass
class LoaderRequest:
    """Parameters supplied by the API caller when importing a benchmark."""

    subset: Optional[str] = None
    split: Optional[str] = None
    limit: int = 100
    offset: int = 0
    shuffle: bool = False
    seed: int = 0


@dataclass
class BenchmarkLoadResult:
    """Examples produced by a loader, plus diagnostic info."""

    examples: List[ParsedExample] = field(default_factory=list)
    fetched: int = 0
    requested: int = 0
    source_url: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


_LETTERS = ("A", "B", "C", "D", "E", "F", "G", "H")


def letter_for_index(index: int) -> str:
    if index < 0 or index >= len(_LETTERS):
        raise ValueError(f"index {index} outside supported letter range")
    return _LETTERS[index]


def format_mcq_input(question: str, choices: List[str], *, lead_in: Optional[str] = None) -> str:
    """Render a question + lettered choice list into the canonical input shown to the model."""
    lines: List[str] = []
    if lead_in:
        lines.append(lead_in.strip())
        lines.append("")
    lines.append(question.strip())
    lines.append("")
    for idx, choice in enumerate(choices):
        letter = letter_for_index(idx)
        lines.append(f"{letter}. {str(choice).strip()}")
    lines.append("")
    lines.append("Answer with a single letter (A, B, C, or D).")
    return "\n".join(lines)
