"""Code-completion scorer (HumanEval-style pass@1).

Builds a runnable program from the example prompt, model completion, and test
harness, then executes it in a subprocess with a timeout.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
from typing import Optional, Tuple

from ...config import get_settings
from .base import BenchmarkScoreResult, ScorerContext


_FENCE_RE = re.compile(r"^```(?:python|py)?\r?\n", re.IGNORECASE)
_FENCE_TAIL_RE = re.compile(r"\n?```\s*$")


def _strip_fences(text: str) -> str:
    cleaned = text
    if cleaned.lstrip().startswith("```"):
        cleaned = cleaned.lstrip()
        cleaned = _FENCE_RE.sub("", cleaned)
        cleaned = _FENCE_TAIL_RE.sub("", cleaned)
    return cleaned.rstrip()


def _strip_prompt_prefix(text: str, prompt: str) -> str:
    if not prompt:
        return text
    prompt_stripped = prompt.strip()
    if text.startswith(prompt_stripped):
        return text[len(prompt_stripped) :].lstrip()
    # Model sometimes repeats only the tail of the prompt (after imports).
    def_idx = prompt_stripped.find("\ndef ")
    if def_idx >= 0 and text.startswith(prompt_stripped[def_idx + 1 :].lstrip()):
        return text[len(prompt_stripped[def_idx + 1 :].lstrip()) :].lstrip()
    return text


def _extract_body_if_full_function(text: str, entry_point: str) -> str:
    """If the model returned a full `def`, keep only the indented body."""
    pattern = rf"def\s+{re.escape(entry_point)}\s*\("
    if not re.search(pattern, text):
        return text

    match = re.search(
        rf"def\s+{re.escape(entry_point)}\s*\([^)]*\)\s*(?:->\s*[^:]+)?\s*:",
        text,
        flags=re.MULTILINE,
    )
    if not match:
        return text

    remainder = text[match.end() :].lstrip("\n")
    if remainder.startswith('"""') or remainder.startswith("'''"):
        quote = remainder[:3]
        end = remainder.find(quote, 3)
        if end >= 0:
            remainder = remainder[end + 3 :].lstrip("\n")
        else:
            return text

    return remainder.strip() or text


def extract_code(
    text: Optional[str],
    *,
    prompt: str = "",
    entry_point: str = "",
) -> Optional[str]:
    if not text or not text.strip():
        return None

    cleaned = _strip_fences(text)
    cleaned = _strip_prompt_prefix(cleaned, prompt)
    if entry_point:
        cleaned = _extract_body_if_full_function(cleaned, entry_point)
    return cleaned.rstrip() or None


def _build_program(
    *,
    prompt: str,
    completion: str,
    test: str,
    entry_point: str,
) -> str:
    body = completion.rstrip()
    standalone = body.lstrip().startswith(("from ", "import ", "def ")) and f"def {entry_point}" in body
    if standalone:
        return f"{body}\n{test}\ncheck({entry_point})"
    return f"{prompt.rstrip()}\n{body}\n{test}\ncheck({entry_point})"


def _run_program(program: str, timeout: float) -> Tuple[bool, str]:
    fd, path = tempfile.mkstemp(suffix=".py", text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(program)
        try:
            completed = subprocess.run(
                [sys.executable, path],
                capture_output=True,
                text=True,
                timeout=timeout,
                env={
                    "PATH": os.environ.get("PATH", ""),
                    "HOME": os.environ.get("HOME", ""),
                    "PYTHONIOENCODING": "utf-8",
                },
            )
        except subprocess.TimeoutExpired:
            return False, f"execution timed out after {timeout:.0f}s"
        if completed.returncode == 0:
            return True, ""
        detail = (completed.stderr or completed.stdout or "non-zero exit").strip()
        return False, detail[:500]
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def score_code(ctx: ScorerContext) -> BenchmarkScoreResult:
    meta = ctx.metadata or {}
    prompt = meta.get("prompt") or ""
    test = meta.get("test")
    entry_point = meta.get("entry_point")

    if not isinstance(prompt, str) or not prompt.strip():
        return BenchmarkScoreResult(scorer="code_exec", parse_error="example missing metadata.prompt")
    if not isinstance(test, str) or not test.strip():
        return BenchmarkScoreResult(scorer="code_exec", parse_error="example missing metadata.test")
    if not isinstance(entry_point, str) or not entry_point.strip():
        return BenchmarkScoreResult(scorer="code_exec", parse_error="example missing metadata.entry_point")

    entry_point = entry_point.strip()
    completion = extract_code(ctx.candidate, prompt=prompt, entry_point=entry_point)
    if completion is None:
        return BenchmarkScoreResult(
            scorer="code_exec",
            expected=entry_point,
            is_correct=False,
            score=0.0,
            parse_error="could not extract Python code from the model output",
            raw_extract=(ctx.candidate or "")[:120] or None,
        )

    program = _build_program(
        prompt=prompt,
        completion=completion,
        test=test,
        entry_point=entry_point,
    )
    timeout = float(get_settings().code_execution_timeout_seconds)
    passed, detail = _run_program(program, timeout=timeout)

    snippet = completion.replace("\n", " ")[:120] or None
    if not passed:
        return BenchmarkScoreResult(
            scorer="code_exec",
            predicted=snippet,
            expected=entry_point,
            is_correct=False,
            score=0.0,
            parse_error=detail or "tests failed",
            raw_extract=snippet,
        )

    return BenchmarkScoreResult(
        scorer="code_exec",
        predicted=snippet,
        expected=entry_point,
        is_correct=True,
        score=1.0,
        raw_extract=snippet,
    )
