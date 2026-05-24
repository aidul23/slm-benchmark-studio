"""Benchmark run schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from ..models.benchmark_run import RunStatus
from ..services.judge_runner import ALL_CRITERIA_KEYS, MIN_CRITERIA


class RunCreate(BaseModel):
    name: str
    dataset_id: int
    prompt_template_id: int
    selected_models: List[str] = Field(min_length=1)
    judge_model: Optional[str] = None
    judge_provider: str = Field(
        default="ollama",
        description="Provider serving the judge model: 'ollama' | 'openai' | 'anthropic' | 'gemini'",
    )
    judge_criteria: Optional[List[str]] = Field(
        default=None,
        description=(
            "Subset of the 5-criterion rubric to score. Must contain at least "
            f"{MIN_CRITERIA} of {list(ALL_CRITERIA_KEYS)}. NULL means use all 5."
        ),
    )
    judge_system_prompt: Optional[str] = Field(
        default=None,
        description="Optional override for the judge's system prompt. Empty/NULL falls back to the default.",
    )
    judge_user_template: Optional[str] = Field(
        default=None,
        description=(
            "Optional override for the judge's user-message template. Supports "
            "{{input}}, {{reference}}, {{output}}, {{criteria_block}}."
        ),
    )
    temperature: float = 0.2
    max_tokens: int = 512
    repeats: int = 1
    notes: Optional[str] = None

    @field_validator("judge_criteria")
    @classmethod
    def _validate_criteria(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return None
        # Dedupe while preserving order, then validate.
        seen: set[str] = set()
        cleaned: List[str] = []
        for item in value:
            if not isinstance(item, str):
                raise ValueError("judge_criteria entries must be strings.")
            if item not in ALL_CRITERIA_KEYS:
                raise ValueError(
                    f"Unknown criterion '{item}'. Allowed: {list(ALL_CRITERIA_KEYS)}"
                )
            if item not in seen:
                seen.add(item)
                cleaned.append(item)
        if len(cleaned) < MIN_CRITERIA:
            raise ValueError(
                f"Select at least {MIN_CRITERIA} criteria (got {len(cleaned)})."
            )
        return cleaned


class RunRead(BaseModel):
    id: int
    name: str
    dataset_id: int
    prompt_template_id: int
    selected_models: List[str]
    judge_model: Optional[str] = None
    judge_provider: str = "ollama"
    judge_criteria: List[str] = Field(
        default_factory=lambda: list(ALL_CRITERIA_KEYS),
        description="Criteria that were/will be scored for this run.",
    )
    judge_system_prompt: Optional[str] = None
    judge_user_template: Optional[str] = None
    status: RunStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress_total: int
    progress_done: int
    current_phase: Optional[str] = None
    current_activity: Optional[str] = None
    export_path: Optional[str] = None
    error: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


class RunUpdate(BaseModel):
    notes: Optional[str] = None


class RunStartRequest(BaseModel):
    """Optional body passed to POST /api/runs/{id}/start.

    The `judge_api_key` is the user's secret key for the chosen judge provider.
    It is held only in the background-task closure for the duration of the run
    and is never persisted or returned by any endpoint.
    """

    judge_api_key: Optional[str] = None
