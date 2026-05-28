"""HumanEval loader (`openai/openai_humaneval` on HuggingFace).

Each row has: `task_id`, `prompt` (signature + docstring), `canonical_solution`
(function body), `test` (check harness), `entry_point` (function name).

The model completes the function body; the code scorer executes
`prompt + completion + test + check(entry_point)`.
"""
from __future__ import annotations

from typing import List

from ...utils.jsonl import ParsedExample
from .base import BenchmarkLoaderInfo, BenchmarkLoadResult, BenchmarkSubset, LoaderRequest
from .hf_client import fetch_rows


_HF_DATASET = "openai/openai_humaneval"
_DEFAULT_CONFIG = "openai_humaneval"
_DEFAULT_SPLIT = "test"
_TOTAL_TASKS = 164


HUMANEVAL_INFO = BenchmarkLoaderInfo(
    key="humaneval",
    name="HumanEval",
    description=(
        "OpenAI HumanEval Python coding tasks (164 problems). The model completes "
        "a function body; scoring runs the official unit-test harness (pass@1). "
        "Use a code prompt template and consider raising max tokens (e.g. 1024)."
    ),
    task_type="code",
    default_split=_DEFAULT_SPLIT,
    splits=["test"],
    subsets=[
        BenchmarkSubset(
            _DEFAULT_CONFIG,
            "HumanEval (Python)",
            "Full HumanEval test split",
        ),
    ],
    default_subset=_DEFAULT_CONFIG,
    suggested_limit=20,
    max_limit=_TOTAL_TASKS,
    docs_url="https://huggingface.co/datasets/openai/openai_humaneval",
)


def load_humaneval(request: LoaderRequest) -> BenchmarkLoadResult:
    config = (request.subset or _DEFAULT_CONFIG).strip() or _DEFAULT_CONFIG
    split = (request.split or _DEFAULT_SPLIT).strip() or _DEFAULT_SPLIT
    limit = max(0, min(int(request.limit or 0), HUMANEVAL_INFO.max_limit))

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
            examples.append(_row_to_example(row, split=split))
        except _SkipRow as skip:
            warnings.append(str(skip))
            continue

    return BenchmarkLoadResult(
        examples=examples,
        fetched=len(rows),
        requested=limit,
        source_url=source_url,
        warnings=warnings[:25],
    )


class _SkipRow(Exception):
    pass


def _format_input(prompt: str, entry_point: str) -> str:
    return (
        "Complete the Python function below.\n"
        "Write only the indented function body (implementation lines).\n"
        "Do not repeat the `def` line, imports, or markdown code fences.\n\n"
        f"{prompt.strip()}\n"
    )


def _row_to_example(row: dict, *, split: str) -> ParsedExample:
    task_id = row.get("task_id")
    prompt = row.get("prompt")
    test = row.get("test")
    entry_point = row.get("entry_point")
    canonical = row.get("canonical_solution")

    if not isinstance(task_id, str) or not task_id.strip():
        raise _SkipRow("row missing 'task_id'")
    if not isinstance(prompt, str) or not prompt.strip():
        raise _SkipRow(f"{task_id}: missing 'prompt'")
    if not isinstance(test, str) or not test.strip():
        raise _SkipRow(f"{task_id}: missing 'test'")
    if not isinstance(entry_point, str) or not entry_point.strip():
        raise _SkipRow(f"{task_id}: missing 'entry_point'")

    metadata = {
        "benchmark": "humaneval",
        "task_type": "code",
        "task_id": task_id,
        "entry_point": entry_point.strip(),
        "prompt": prompt,
        "test": test,
        "split": split,
    }
    if isinstance(canonical, str) and canonical.strip():
        metadata["canonical_solution"] = canonical

    return ParsedExample(
        input=_format_input(prompt, entry_point.strip()),
        reference=entry_point.strip(),
        category=task_id,
        difficulty=None,
        external_id=task_id,
        metadata=metadata,
    )
