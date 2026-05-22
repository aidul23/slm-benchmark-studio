"""HellaSwag loader (`Rowan/hellaswag` on HuggingFace).

HellaSwag asks the model to pick the most plausible ending for a short passage.
Each row has: `ctx_a`, `ctx_b`, `ctx`, `endings` (4 strings), `label` (string "0"–"3",
empty on the test split because labels are held out).

Because the test split is unlabeled we default to the `validation` split, which
is the convention used by the original paper and most leaderboards.
"""
from __future__ import annotations

from typing import List, Optional

from ...utils.jsonl import ParsedExample
from .base import (
    BenchmarkLoaderInfo,
    BenchmarkLoadResult,
    BenchmarkSubset,
    LoaderRequest,
    format_mcq_input,
    letter_for_index,
)
from .hf_client import fetch_rows


_HF_DATASET = "Rowan/hellaswag"
_DEFAULT_CONFIG = "default"
_DEFAULT_SPLIT = "validation"


HELLASWAG_INFO = BenchmarkLoaderInfo(
    key="hellaswag",
    name="HellaSwag",
    description=(
        "Commonsense sentence completion. The model picks the most plausible "
        "ending for a short context. We use the validation split because the "
        "test split has hidden labels. Scored by letter parsing (generation mode)."
    ),
    task_type="mcq",
    default_split=_DEFAULT_SPLIT,
    splits=["validation", "train"],
    subsets=[BenchmarkSubset("default", "Default", "Full HellaSwag mix")],
    default_subset=_DEFAULT_CONFIG,
    suggested_limit=100,
    max_limit=2000,
    docs_url="https://huggingface.co/datasets/Rowan/hellaswag",
)


def load_hellaswag(request: LoaderRequest) -> BenchmarkLoadResult:
    config = (request.subset or _DEFAULT_CONFIG).strip() or _DEFAULT_CONFIG
    split = (request.split or _DEFAULT_SPLIT).strip() or _DEFAULT_SPLIT
    limit = max(0, min(int(request.limit or 0), HELLASWAG_INFO.max_limit))

    rows, source_url = fetch_rows(
        dataset=_HF_DATASET,
        config=config,
        split=split,
        limit=limit,
        offset=max(0, int(request.offset or 0)),
        shuffle=request.shuffle,
        seed=request.seed,
    )

    examples: List[ParsedExample] = []
    warnings: List[str] = []
    for row in rows:
        try:
            example = _row_to_example(row, subset=config, split=split)
        except _SkipRow as skip:
            warnings.append(str(skip))
            continue
        examples.append(example)

    if split == "test" and not examples and rows:
        warnings.append(
            "HellaSwag's test split has hidden labels; switch to 'validation' to score."
        )

    return BenchmarkLoadResult(
        examples=examples,
        fetched=len(rows),
        requested=limit,
        source_url=source_url,
        warnings=warnings[:25],
    )


class _SkipRow(Exception):
    pass


def _row_to_example(row: dict, *, subset: str, split: str) -> ParsedExample:
    endings = row.get("endings")
    label_raw = row.get("label")

    if not isinstance(endings, list) or len(endings) < 2:
        raise _SkipRow("row 'endings' is not a list of >=2 items")

    answer_index = _coerce_label(label_raw)
    if answer_index is None:
        raise _SkipRow("row has no integer label (likely held-out test split)")
    if answer_index < 0 or answer_index >= len(endings):
        raise _SkipRow(f"row label {answer_index} out of range")

    gold_letter = letter_for_index(answer_index)
    context = _build_context(row)
    if not context:
        raise _SkipRow("row has no usable context")

    rendered_input = format_mcq_input(
        context,
        [str(e) for e in endings],
        lead_in="Pick the most plausible ending for the passage below.",
    )

    metadata = {
        "benchmark": "hellaswag",
        "task_type": "mcq",
        "subset": subset,
        "split": split,
        "activity_label": row.get("activity_label"),
        "ctx_a": row.get("ctx_a"),
        "ctx_b": row.get("ctx_b"),
        "endings": [str(e) for e in endings],
        "answer_index": answer_index,
        "answer_letter": gold_letter,
    }

    return ParsedExample(
        input=rendered_input,
        reference=gold_letter,
        category=(row.get("activity_label") or "hellaswag"),
        difficulty=None,
        external_id=f"hellaswag/{row.get('ind') or row.get('source_id') or ''}".rstrip("/"),
        metadata=metadata,
    )


def _coerce_label(value: object) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return int(stripped)
        except ValueError:
            return None
    return None


def _build_context(row: dict) -> str:
    ctx = row.get("ctx")
    if isinstance(ctx, str) and ctx.strip():
        return ctx.strip()
    ctx_a = row.get("ctx_a")
    ctx_b = row.get("ctx_b")
    pieces = [p for p in (ctx_a, ctx_b) if isinstance(p, str) and p.strip()]
    return " ".join(pieces).strip()
