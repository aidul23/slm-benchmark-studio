"""Multiple-choice scorer.

Parses an A/B/C/D/E letter out of a free-text model response and compares it to
the expected gold letter coming from the example metadata.

The candidate text we receive comes from a generative chat model (because Ollama
does not expose token log-likelihoods), so we have to be tolerant of formatting:

    "A"
    "A."
    "A) ..."
    "The answer is B."
    "Answer: C"
    "**D**"
    "```\nA\n```"

Strategy:
1. Strip whitespace and code fences.
2. Try a small ladder of patterns, most-specific first.
3. Fall back to the first standalone letter A–E in the first ~200 chars.
"""
from __future__ import annotations

import re
from typing import Optional

from .base import BenchmarkScoreResult, ScorerContext


_VALID_LETTERS = ("A", "B", "C", "D", "E")
_LETTERS_RE = "|".join(_VALID_LETTERS)

# Order matters: most specific patterns first.
_PATTERNS = (
    rf"(?i)\banswer\s*(?:is|:)\s*\(?\s*({_LETTERS_RE})\s*\)?",
    rf"(?i)\bthe\s+correct\s+answer\s+is\s+\(?\s*({_LETTERS_RE})\s*\)?",
    rf"(?i)\boption\s*\(?\s*({_LETTERS_RE})\s*\)?",
    rf"(?i)\bchoice\s*\(?\s*({_LETTERS_RE})\s*\)?",
    rf"^\s*\(?\s*({_LETTERS_RE})\s*[\).\:\-]",
    rf"(?i)\*\*\s*({_LETTERS_RE})\s*\*\*",
    rf"^\s*({_LETTERS_RE})\s*$",
)


def _strip_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```\s*$", "", cleaned)
    return cleaned.strip()


def extract_letter(text: Optional[str]) -> Optional[str]:
    """Best-effort extraction of an A–E choice letter from free-form text."""
    if not text:
        return None
    candidate = _strip_fences(text)
    if not candidate:
        return None

    for pattern in _PATTERNS:
        # Search only the first ~400 chars to avoid picking letters out of
        # later sentences that happen to start with A/B/C/D.
        match = re.search(pattern, candidate[:400], flags=re.MULTILINE)
        if match:
            return match.group(1).upper()

    # Fallback: first standalone capital letter A-E in the leading slice.
    fallback = re.search(rf"(?<![A-Za-z])({_LETTERS_RE})(?![A-Za-z])", candidate[:200])
    if fallback:
        return fallback.group(1).upper()
    return None


def _expected_letter(ctx: ScorerContext) -> Optional[str]:
    """Resolve the gold letter from metadata first, then from `reference`."""
    meta = ctx.metadata or {}
    letter = meta.get("answer_letter")
    if isinstance(letter, str) and letter.strip():
        return letter.strip().upper()

    index = meta.get("answer_index")
    if isinstance(index, int) and 0 <= index < len(_VALID_LETTERS):
        return _VALID_LETTERS[index]

    if ctx.reference:
        ref = ctx.reference.strip()
        if len(ref) == 1 and ref.upper() in _VALID_LETTERS:
            return ref.upper()
        # Maybe the reference is the full answer text — try to match against
        # the choices list.
        choices = meta.get("choices")
        if isinstance(choices, list):
            for idx, choice in enumerate(choices):
                if isinstance(choice, str) and choice.strip().lower() == ref.lower():
                    if idx < len(_VALID_LETTERS):
                        return _VALID_LETTERS[idx]
    return None


def score_mcq(ctx: ScorerContext) -> BenchmarkScoreResult:
    expected = _expected_letter(ctx)
    if expected is None:
        return BenchmarkScoreResult(
            scorer="mcq_letter",
            parse_error="no gold letter on example metadata",
        )

    predicted = extract_letter(ctx.candidate)
    if predicted is None:
        return BenchmarkScoreResult(
            scorer="mcq_letter",
            expected=expected,
            is_correct=False,
            score=0.0,
            parse_error="could not parse a choice letter from the model output",
            raw_extract=(ctx.candidate or "")[:120] or None,
        )

    is_correct = predicted == expected
    return BenchmarkScoreResult(
        scorer="mcq_letter",
        predicted=predicted,
        expected=expected,
        is_correct=is_correct,
        score=1.0 if is_correct else 0.0,
        raw_extract=(ctx.candidate or "")[:120] or None,
    )
