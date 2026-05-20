"""Runs the LLM judge against generated outputs and parses its JSON verdict."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, Optional

from . import prompt_renderer
from .ollama_client import ChatResponse, OllamaClient, OllamaError


DEFAULT_JUDGE_SYSTEM = (
    "You are an impartial evaluator for small language model outputs. "
    "You must return only valid JSON."
)

DEFAULT_JUDGE_TEMPLATE = """Evaluate the candidate answer against the reference answer and the original input.

Score each criterion from 1 to 5.

Criteria:
1. correctness: Does the answer match the reference?
2. factuality: Does the answer avoid unsupported claims?
3. completeness: Does it cover the important points?
4. conciseness: Is it direct and not unnecessarily verbose?
5. instruction_following: Did it follow the requested task and format?

Return only valid JSON in this exact format:
{
  "correctness": 1,
  "factuality": 1,
  "completeness": 1,
  "conciseness": 1,
  "instruction_following": 1,
  "overall": 1,
  "reason": "short explanation"
}

Original input:
{{input}}

Reference answer:
{{reference}}

Candidate answer:
{{output}}
"""


SCORE_KEYS = (
    "correctness",
    "factuality",
    "completeness",
    "conciseness",
    "instruction_following",
)


@dataclass
class JudgeVerdict:
    correctness: Optional[float] = None
    factuality: Optional[float] = None
    completeness: Optional[float] = None
    conciseness: Optional[float] = None
    instruction_following: Optional[float] = None
    overall: Optional[float] = None
    reason: Optional[str] = None
    raw: Optional[str] = None
    parse_error: Optional[str] = None


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)
_BARE_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def _coerce_score(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        score = float(value)
    except (TypeError, ValueError):
        return None
    # Clamp to the 1..5 rubric range.
    return max(1.0, min(5.0, score))


def parse_judge_output(text: str) -> JudgeVerdict:
    """Parse a judge response, repairing common formatting issues (markdown fences)."""
    if text is None:
        return JudgeVerdict(parse_error="empty judge response", raw=text)
    stripped = text.strip()
    if not stripped:
        return JudgeVerdict(parse_error="empty judge response", raw=text)

    candidates = [stripped]
    fence_match = _JSON_FENCE_RE.search(stripped)
    if fence_match:
        candidates.append(fence_match.group(1))
    bare_match = _BARE_OBJECT_RE.search(stripped)
    if bare_match:
        candidates.append(bare_match.group(0))

    parsed: Optional[Dict[str, Any]] = None
    last_error: Optional[str] = None
    for candidate in candidates:
        try:
            value = json.loads(candidate)
            if isinstance(value, dict):
                parsed = value
                break
        except json.JSONDecodeError as exc:
            last_error = str(exc)

    if parsed is None:
        return JudgeVerdict(parse_error=last_error or "could not parse JSON", raw=text)

    verdict = JudgeVerdict(raw=text)
    for key in SCORE_KEYS:
        setattr(verdict, key, _coerce_score(parsed.get(key)))

    overall = _coerce_score(parsed.get("overall"))
    if overall is None:
        scores = [getattr(verdict, key) for key in SCORE_KEYS if getattr(verdict, key) is not None]
        overall = sum(scores) / len(scores) if scores else None
    verdict.overall = overall

    reason = parsed.get("reason")
    if reason is not None:
        verdict.reason = str(reason)
    return verdict


class JudgeRunner:
    """Calls the judge model and returns a structured verdict."""

    def __init__(
        self,
        ollama: OllamaClient,
        *,
        system_prompt: str = DEFAULT_JUDGE_SYSTEM,
        user_template: str = DEFAULT_JUDGE_TEMPLATE,
        temperature: float = 0.0,
    ) -> None:
        self.ollama = ollama
        self.system_prompt = system_prompt
        self.user_template = user_template
        self.temperature = temperature

    async def judge(
        self,
        *,
        model: str,
        input_text: str,
        reference: Optional[str],
        candidate: Optional[str],
        category: Optional[str] = None,
        difficulty: Optional[str] = None,
    ) -> JudgeVerdict:
        variables: Dict[str, Any] = {
            "input": input_text,
            "reference": reference or "",
            "output": candidate or "",
            "category": category or "",
            "difficulty": difficulty or "",
        }
        rendered = prompt_renderer.render(self.user_template, variables)
        messages = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.append({"role": "user", "content": rendered})

        try:
            response: ChatResponse = await self.ollama.chat(
                model=model,
                messages=messages,
                temperature=self.temperature,
                format_json=True,
            )
        except OllamaError as exc:
            return JudgeVerdict(parse_error=f"judge call failed: {exc}")

        verdict = parse_judge_output(response.content)
        return verdict
