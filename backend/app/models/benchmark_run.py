"""Benchmark run entity."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class BenchmarkRun(SQLModel, table=True):
    __tablename__ = "benchmark_runs"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    dataset_id: int = Field(foreign_key="datasets.id", index=True)
    prompt_template_id: int = Field(foreign_key="prompt_templates.id", index=True)
    selected_models_json: str = Field(description="JSON list of model names used as generators")
    judge_model: Optional[str] = Field(default=None)
    status: RunStatus = Field(default=RunStatus.PENDING, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    started_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)
    config_json: Optional[str] = Field(default=None)
    progress_total: int = Field(default=0)
    progress_done: int = Field(default=0)
    error: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None)
