"""Runs the LLM judge against generated outputs and parses its JSON verdict."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence

from . import prompt_renderer
from .providers import ChatMessage, ChatProvider, ProviderError


# ---------------------------------------------------------------------------
# Rubric — fixed set of 5 criteria.
#
# Users may pick *which* of these the judge should score (minimum two), and
# may freely edit the system / user prompt around the rubric — but they cannot
# add brand-new criteria, because:
#   - the JudgeScore table has one column per key (changing that is a real
#     schema migration),
#   - the frontend charts and CSV exports key off these names,
#   - the parser only knows how to coerce these five keys.
# ---------------------------------------------------------------------------
CRITERION_DESCRIPTIONS: Dict[str, str] = {
    "correctness": "Does the answer match the reference?",
    "factuality": "Does the answer avoid unsupported claims?",
    "completeness": "Does it cover the important points?",
    "conciseness": "Is it direct and not unnecessarily verbose?",
    "instruction_following": "Did it follow the requested task and format?",
}

ALL_CRITERIA_KEYS: tuple[str, ...] = tuple(CRITERION_DESCRIPTIONS.keys())

# At least two criteria must be selected — anything less doesn't give us
# enough signal to draw cross-criterion comparisons in the UI.
MIN_CRITERIA: int = 2

# Back-compat alias used by older callers / tests.
SCORE_KEYS = ALL_CRITERIA_KEYS

DEFAULT_JUDGE_SYSTEM = (
    "You are an impartial evaluator for small language model outputs. "
    "You must return only valid JSON."
)

# The default template uses `{{criteria_block}}` so the listed criteria + the
# requested JSON shape always match the user's selected rubric. Users can edit
# the rest of the template freely; the renderer leaves unknown placeholders
# untouched, so even a heavily-customized template keeps working as long as
# the judge returns JSON with the selected criterion keys.
DEFAULT_JUDGE_TEMPLATE = """Evaluate the candidate answer against the reference answer and the original input.

Score each listed criterion from 1 to 5.

{{criteria_block}}

Original input:
{{input}}

Reference answer:
{{reference}}

Candidate answer:
{{output}}
"""


def normalize_criteria(selected: Optional[Iterable[str]]) -> List[str]:
    """Return a deduped, ordered list of valid criterion keys.

    Falls back to all five when `selected` is empty/None so existing runs
    that predate the rubric-picker still behave identically.
    """
    if not selected:
        return list(ALL_CRITERIA_KEYS)
    seen: set[str] = set()
    out: List[str] = []
    for key in selected:
        if key in CRITERION_DESCRIPTIONS and key not in seen:
            seen.add(key)
            out.append(key)
    # Preserve canonical order regardless of input order, so the prompt and
    # the JSON schema example are stable across runs.
    return [k for k in ALL_CRITERIA_KEYS if k in seen]


def render_criteria_block(selected: Sequence[str]) -> str:
    """Build the "Criteria + expected JSON" portion of the judge prompt."""
    keys = normalize_criteria(selected)
    lines: List[str] = ["Criteria:"]
    for i, key in enumerate(keys, start=1):
        lines.append(f"{i}. {key}: {CRITERION_DESCRIPTIONS[key]}")
    lines.append("")
    lines.append("Return only valid JSON in this exact format:")
    lines.append("{")
    for key in keys:
        lines.append(f'  "{key}": 1,')
    lines.append('  "overall": 1,')
    lines.append('  "reason": "short explanation"')
    lines.append("}")
    return "\n".join(lines)


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


def parse_judge_output(
    text: str,
    selected_criteria: Optional[Sequence[str]] = None,
) -> JudgeVerdict:
    """Parse a judge response, repairing common formatting issues (markdown fences).

    `selected_criteria` restricts which criterion keys are read from the judge
    output — any key the user did not pick is left as `None` on the verdict,
    so downstream aggregation never counts it. If `None`, all five are read.
    """
    keys = normalize_criteria(selected_criteria) if selected_criteria else list(ALL_CRITERIA_KEYS)

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
    for key in keys:
        setattr(verdict, key, _coerce_score(parsed.get(key)))

    overall = _coerce_score(parsed.get("overall"))
    if overall is None:
        scores = [getattr(verdict, key) for key in keys if getattr(verdict, key) is not None]
        overall = sum(scores) / len(scores) if scores else None
    verdict.overall = overall

    reason = parsed.get("reason")
    if reason is not None:
        verdict.reason = str(reason)
    return verdict


class JudgeRunner:
    """Calls the judge model and returns a structured verdict.

    The runner is provider-agnostic: any object implementing the `ChatProvider`
    interface (local Ollama, OpenAI, Anthropic, Gemini, …) can be passed in.
    The API key is stored in the runner instance only for the duration of the
    run — never persisted, never logged.
    """

    def __init__(
        self,
        provider: ChatProvider,
        *,
        api_key: Optional[str] = None,
        system_prompt: Optional[str] = None,
        user_template: Optional[str] = None,
        criteria: Optional[Sequence[str]] = None,
        temperature: float = 0.0,
    ) -> None:
        self.provider = provider
        self._api_key = api_key
        # Empty / None overrides fall back to the canonical defaults so a user
        # can clear the textarea without breaking the judge.
        self.system_prompt = (system_prompt or "").strip() or DEFAULT_JUDGE_SYSTEM
        self.user_template = (user_template or "").strip() or DEFAULT_JUDGE_TEMPLATE
        self.criteria = normalize_criteria(criteria)
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
            # Rendered list of criteria + the expected JSON schema. Even if the
            # user edits the template, leaving this placeholder in keeps the
            # rubric in sync with their selection automatically.
            "criteria_block": render_criteria_block(self.criteria),
        }
        rendered = prompt_renderer.render(self.user_template, variables)
        messages = []
        if self.system_prompt:
            messages.append(ChatMessage(role="system", content=self.system_prompt))
        messages.append(ChatMessage(role="user", content=rendered))

        try:
            response = await self.provider.chat(
                api_key=self._api_key,
                model=model,
                messages=messages,
                temperature=self.temperature,
                format_json=True,
            )
        except ProviderError as exc:
            return JudgeVerdict(parse_error=f"judge call failed: {exc}")

        return parse_judge_output(response.content, selected_criteria=self.criteria)
