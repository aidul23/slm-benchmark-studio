"""MMLU loader (`cais/mmlu` on HuggingFace).

Each MMLU row has: `question`, `subject`, `choices` (4 items), `answer` (int 0–3).
We render the question + lettered choices into the `input` field used by all the
existing prompt templates, store the gold letter as `reference`, and stash the
raw fields in `metadata` so other scorers (or the UI) can use them later.
"""
from __future__ import annotations

from typing import List

from ...utils.jsonl import ParsedExample
from .base import (
    BenchmarkLoaderInfo,
    BenchmarkLoadResult,
    BenchmarkSubset,
    LoaderRequest,
    format_mcq_input,
    letter_for_index,
)
from .hf_client import HFDatasetServerError, fetch_rows


_HF_DATASET = "cais/mmlu"
_DEFAULT_CONFIG = "all"
_DEFAULT_SPLIT = "test"

# A curated short list of MMLU subjects to keep the UI form approachable. Users
# can fall back to "all" for the full 14k-example mix.
_FEATURED_SUBJECTS: List[BenchmarkSubset] = [
    BenchmarkSubset("all", "All subjects (mixed)", "Full MMLU test set, all 57 subjects"),
    BenchmarkSubset("abstract_algebra", "Abstract algebra"),
    BenchmarkSubset("anatomy", "Anatomy"),
    BenchmarkSubset("astronomy", "Astronomy"),
    BenchmarkSubset("college_biology", "College biology"),
    BenchmarkSubset("college_chemistry", "College chemistry"),
    BenchmarkSubset("college_computer_science", "College computer science"),
    BenchmarkSubset("college_mathematics", "College mathematics"),
    BenchmarkSubset("computer_security", "Computer security"),
    BenchmarkSubset("electrical_engineering", "Electrical engineering"),
    BenchmarkSubset("elementary_mathematics", "Elementary mathematics"),
    BenchmarkSubset("formal_logic", "Formal logic"),
    BenchmarkSubset("global_facts", "Global facts"),
    BenchmarkSubset("high_school_biology", "High-school biology"),
    BenchmarkSubset("high_school_computer_science", "High-school computer science"),
    BenchmarkSubset("high_school_mathematics", "High-school mathematics"),
    BenchmarkSubset("high_school_physics", "High-school physics"),
    BenchmarkSubset("high_school_world_history", "High-school world history"),
    BenchmarkSubset("logical_fallacies", "Logical fallacies"),
    BenchmarkSubset("machine_learning", "Machine learning"),
    BenchmarkSubset("management", "Management"),
    BenchmarkSubset("marketing", "Marketing"),
    BenchmarkSubset("medical_genetics", "Medical genetics"),
    BenchmarkSubset("philosophy", "Philosophy"),
    BenchmarkSubset("professional_law", "Professional law"),
    BenchmarkSubset("professional_medicine", "Professional medicine"),
    BenchmarkSubset("professional_psychology", "Professional psychology"),
    BenchmarkSubset("public_relations", "Public relations"),
    BenchmarkSubset("us_foreign_policy", "US foreign policy"),
    BenchmarkSubset("world_religions", "World religions"),
]


MMLU_INFO = BenchmarkLoaderInfo(
    key="mmlu",
    name="MMLU",
    description=(
        "Massive Multitask Language Understanding. 57 academic subjects, 4-way "
        "multiple choice. Scored by letter parsing (generation mode — Ollama does "
        "not expose log-likelihoods)."
    ),
    task_type="mcq",
    default_split=_DEFAULT_SPLIT,
    splits=["test", "validation", "dev"],
    subsets=_FEATURED_SUBJECTS,
    default_subset=_DEFAULT_CONFIG,
    suggested_limit=100,
    max_limit=2000,
    docs_url="https://huggingface.co/datasets/cais/mmlu",
)


def load_mmlu(request: LoaderRequest) -> BenchmarkLoadResult:
    config = (request.subset or _DEFAULT_CONFIG).strip() or _DEFAULT_CONFIG
    split = (request.split or _DEFAULT_SPLIT).strip() or _DEFAULT_SPLIT
    limit = max(0, min(int(request.limit or 0), MMLU_INFO.max_limit))

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
    question = row.get("question")
    choices = row.get("choices")
    answer = row.get("answer")
    subject = row.get("subject") or subset

    if not isinstance(question, str) or not question.strip():
        raise _SkipRow("row missing 'question'")
    if not isinstance(choices, list) or len(choices) < 2:
        raise _SkipRow("row 'choices' is not a list of >=2 items")
    if not isinstance(answer, int) or answer < 0 or answer >= len(choices):
        raise _SkipRow(f"row 'answer' index out of range: {answer}")

    gold_letter = letter_for_index(answer)
    rendered_input = format_mcq_input(
        question,
        [str(c) for c in choices],
        lead_in=(
            "The following is a multiple-choice question about "
            f"{_subject_label(subject)}."
        ),
    )

    metadata = {
        "benchmark": "mmlu",
        "task_type": "mcq",
        "subset": subset,
        "subject": subject,
        "split": split,
        "choices": [str(c) for c in choices],
        "answer_index": answer,
        "answer_letter": gold_letter,
    }

    return ParsedExample(
        input=rendered_input,
        reference=gold_letter,
        category=subject,
        difficulty=None,
        external_id=f"mmlu/{subject}/{row.get('id') or row.get('question_id') or ''}".rstrip("/"),
        metadata=metadata,
    )


def _subject_label(subject: str) -> str:
    return subject.replace("_", " ")
