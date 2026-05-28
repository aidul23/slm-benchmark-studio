"""Benchmark run entity."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, String
from sqlmodel import Field, SQLModel


class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class EvaluationMode(str, Enum):
    """How outputs are scored after generation."""

    BENCHMARK = "benchmark"
    JUDGE = "judge"


class BenchmarkRun(SQLModel, table=True):
    __tablename__ = "benchmark_runs"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    dataset_id: int = Field(foreign_key="datasets.id", index=True)
    prompt_template_id: int = Field(foreign_key="prompt_templates.id", index=True)
    selected_models_json: str = Field(description="JSON list of model names used as generators")
    # Stored as plain TEXT (`benchmark` | `judge`) — not a SQLAlchemy Enum, so SQLite
    # rows migrated with lowercase strings load reliably (Enum would expect BENCHMARK/JUDGE names).
    evaluation_mode: str = Field(
        default="judge",
        sa_column=Column(String, nullable=False, server_default="judge", index=True),
        description="Scoring path: deterministic benchmark (MCQ) or LLM-as-judge rubric.",
    )
    judge_model: Optional[str] = Field(default=None)
    judge_provider: str = Field(
        default="ollama",
        description="Chat provider serving the judge model: 'ollama' | 'openai' | 'anthropic' | 'gemini'",
    )
    judge_criteria_json: Optional[str] = Field(
        default=None,
        description="JSON list of selected criterion keys (subset of the 5-criterion rubric). NULL → all 5.",
    )
    judge_system_prompt: Optional[str] = Field(
        default=None,
        description="Optional user-edited judge system prompt. NULL → use DEFAULT_JUDGE_SYSTEM.",
    )
    judge_user_template: Optional[str] = Field(
        default=None,
        description="Optional user-edited judge user-message template. NULL → use DEFAULT_JUDGE_TEMPLATE.",
    )
    status: RunStatus = Field(default=RunStatus.PENDING, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    started_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)
    config_json: Optional[str] = Field(default=None)
    progress_total: int = Field(default=0)
    progress_done: int = Field(default=0)
    current_phase: Optional[str] = Field(default=None, description="generation | judging | finalizing | done")
    current_activity: Optional[str] = Field(default=None, description="Human-readable description of what is happening right now")
    export_path: Optional[str] = Field(default=None, description="Filesystem path to the most recent CSV export")
    error: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None)


def resolve_evaluation_mode(run: "BenchmarkRun") -> EvaluationMode:
    """Return stored mode, inferring for legacy rows created before the column existed."""
    raw = getattr(run, "evaluation_mode", None)
    if raw is not None and str(raw).strip():
        try:
            return EvaluationMode(str(raw).strip().lower())
        except ValueError:
            pass
    if run.judge_model:
        return EvaluationMode.JUDGE
    return EvaluationMode.BENCHMARK


def normalize_evaluation_mode(mode: EvaluationMode | str) -> str:
    """Persistable string for the DB column."""
    if isinstance(mode, EvaluationMode):
        return mode.value
    return str(mode).strip().lower()
