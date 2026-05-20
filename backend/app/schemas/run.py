"""Benchmark run schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from ..models.benchmark_run import RunStatus


class RunCreate(BaseModel):
    name: str
    dataset_id: int
    prompt_template_id: int
    selected_models: List[str] = Field(min_length=1)
    judge_model: Optional[str] = None
    temperature: float = 0.2
    max_tokens: int = 512
    repeats: int = 1
    notes: Optional[str] = None


class RunRead(BaseModel):
    id: int
    name: str
    dataset_id: int
    prompt_template_id: int
    selected_models: List[str]
    judge_model: Optional[str] = None
    status: RunStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress_total: int
    progress_done: int
    error: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


class RunUpdate(BaseModel):
    notes: Optional[str] = None
