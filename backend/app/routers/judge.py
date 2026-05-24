"""Judge configuration endpoints (defaults + rubric catalog)."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter
from pydantic import BaseModel

from ..services.judge_runner import (
    ALL_CRITERIA_KEYS,
    CRITERION_DESCRIPTIONS,
    DEFAULT_JUDGE_SYSTEM,
    DEFAULT_JUDGE_TEMPLATE,
    MIN_CRITERIA,
)


router = APIRouter(prefix="/api/judge", tags=["judge"])


class CriterionInfo(BaseModel):
    key: str
    label: str
    description: str


class JudgeDefaults(BaseModel):
    """Static defaults for the rubric + prompt editor in the Runs UI.

    The frontend uses this to pre-fill the prompt textareas and to render the
    list of available criteria (with descriptions) for the checkbox group.
    """

    system_prompt: str
    user_template: str
    criteria: List[CriterionInfo]
    min_criteria: int
    placeholders: List[str]


@router.get("/defaults", response_model=JudgeDefaults)
def get_judge_defaults() -> JudgeDefaults:
    # `Title Case` labels are derived from the snake_case keys so the UI does
    # not need to keep a parallel mapping in sync.
    criteria = [
        CriterionInfo(
            key=key,
            label=key.replace("_", " ").title(),
            description=CRITERION_DESCRIPTIONS[key],
        )
        for key in ALL_CRITERIA_KEYS
    ]
    return JudgeDefaults(
        system_prompt=DEFAULT_JUDGE_SYSTEM,
        user_template=DEFAULT_JUDGE_TEMPLATE,
        criteria=criteria,
        min_criteria=MIN_CRITERIA,
        placeholders=["{{input}}", "{{reference}}", "{{output}}", "{{criteria_block}}"],
    )
