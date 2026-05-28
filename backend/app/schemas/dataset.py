"""Dataset request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class DatasetCreate(BaseModel):
    name: str
    description: Optional[str] = None


class DatasetRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    example_count: int = 0
    kind: str = Field(
        default="general",
        description="'benchmark' when examples carry metadata.task_type (MMLU/HellaSwag imports); else 'general'.",
    )


class ExampleCreate(BaseModel):
    input: str
    reference: Optional[str] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    external_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ExampleRead(BaseModel):
    id: int
    dataset_id: int
    external_id: Optional[str] = None
    input: str
    reference: Optional[str] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class DatasetUploadResponse(BaseModel):
    dataset: DatasetRead
    parsed: int
    skipped: int
    errors: List[str] = Field(default_factory=list)


class DatasetDetail(DatasetRead):
    examples: List[ExampleRead] = Field(default_factory=list)
