"""Workshop participant scoping for multi-user demo deployments."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from fastapi import Header, HTTPException
from sqlalchemy import or_

from .config import get_settings
from .models.benchmark_run import BenchmarkRun
from .models.dataset import Dataset
from .models.prompt_template import PromptTemplate


PARTICIPANT_HEADER = "X-Participant-Id"
ADMIN_HEADER = "X-Workshop-Admin-Key"


@dataclass(frozen=True)
class ParticipantContext:
    """Resolved caller identity for workshop mode."""

    key: Optional[str]
    scoped: bool
    is_admin: bool = False


def normalize_participant_id(raw: str) -> str:
    """Normalize a display name into a stable owner key."""
    value = raw.strip().lower()
    value = re.sub(r"[^a-z0-9_-]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    if len(value) < 2 or len(value) > 32:
        raise HTTPException(
            status_code=400,
            detail="Participant name must be 2–32 characters (letters, numbers, hyphen, underscore).",
        )
    return value


def get_participant(
    participant_id: Optional[str] = Header(default=None, alias=PARTICIPANT_HEADER),
    admin_key: Optional[str] = Header(default=None, alias=ADMIN_HEADER),
) -> ParticipantContext:
    """FastAPI dependency: resolve workshop participant or admin bypass."""
    settings = get_settings()
    if not settings.workshop_mode:
        return ParticipantContext(key=None, scoped=False)

    configured_admin = (settings.workshop_admin_key or "").strip()
    if configured_admin and admin_key and admin_key.strip() == configured_admin:
        return ParticipantContext(key=None, scoped=False, is_admin=True)

    if not participant_id or not participant_id.strip():
        raise HTTPException(
            status_code=401,
            detail="Workshop mode requires an X-Participant-Id header. Enter your name in the app.",
        )

    return ParticipantContext(key=normalize_participant_id(participant_id), scoped=True)


def owner_key_for_create(participant: ParticipantContext) -> Optional[str]:
    """Persisted owner for newly created rows."""
    if participant.scoped and participant.key:
        return participant.key
    return None


def filter_runs_query(participant: ParticipantContext, query):
    if participant.scoped and participant.key:
        return query.where(BenchmarkRun.owner_key == participant.key)  # type: ignore[name-defined]
    return query


def filter_datasets_query(participant: ParticipantContext, query):
    if participant.scoped and participant.key:
        return query.where(Dataset.owner_key == participant.key)  # type: ignore[name-defined]
    return query


def filter_prompts_query(participant: ParticipantContext, query):
    if participant.scoped and participant.key:
        return query.where(
            or_(
                PromptTemplate.owner_key.is_(None),  # type: ignore[union-attr]
                PromptTemplate.owner_key == participant.key,  # type: ignore[arg-type]
            )
        )
    return query


def get_run_or_404(session, run_id: int, participant: ParticipantContext) -> BenchmarkRun:
    run = session.get(BenchmarkRun, run_id)
    if run is None or not _can_read_run(run, participant):
        raise HTTPException(status_code=404, detail="Run not found")
    return run


def get_dataset_or_404(session, dataset_id: int, participant: ParticipantContext) -> Dataset:
    dataset = session.get(Dataset, dataset_id)
    if dataset is None or not _can_read_dataset(dataset, participant):
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


def get_prompt_or_404(session, prompt_id: int, participant: ParticipantContext) -> PromptTemplate:
    template = session.get(PromptTemplate, prompt_id)
    if template is None or not _can_read_prompt(template, participant):
        raise HTTPException(status_code=404, detail="Prompt template not found")
    return template


def assert_dataset_usable(dataset: Dataset, participant: ParticipantContext) -> None:
    if not _can_read_dataset(dataset, participant):
        raise HTTPException(status_code=404, detail="Dataset not found")


def assert_prompt_usable(template: PromptTemplate, participant: ParticipantContext) -> None:
    if not _can_read_prompt(template, participant):
        raise HTTPException(status_code=404, detail="Prompt template not found")


def assert_can_mutate_prompt(template: PromptTemplate, participant: ParticipantContext) -> None:
    if not participant.scoped:
        return
    if template.owner_key is None:
        raise HTTPException(status_code=403, detail="Built-in prompt templates cannot be edited or deleted.")
    if template.owner_key != participant.key:
        raise HTTPException(status_code=404, detail="Prompt template not found")


def _can_read_run(run: BenchmarkRun, participant: ParticipantContext) -> bool:
    if not participant.scoped:
        return True
    return run.owner_key == participant.key


def _can_read_dataset(dataset: Dataset, participant: ParticipantContext) -> bool:
    if not participant.scoped:
        return True
    return dataset.owner_key == participant.key


def _can_read_prompt(template: PromptTemplate, participant: ParticipantContext) -> bool:
    if not participant.scoped:
        return True
    if template.owner_key is None:
        return True
    return template.owner_key == participant.key
