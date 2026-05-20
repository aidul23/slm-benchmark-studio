"""Dataset example entity."""
from __future__ import annotations

from typing import Optional

from sqlmodel import Field, SQLModel


class DatasetExample(SQLModel, table=True):
    __tablename__ = "dataset_examples"

    id: Optional[int] = Field(default=None, primary_key=True)
    dataset_id: int = Field(foreign_key="datasets.id", index=True)
    external_id: Optional[str] = Field(default=None, description="Original id from the JSONL row, if provided")
    input: str
    reference: Optional[str] = Field(default=None)
    category: Optional[str] = Field(default=None, index=True)
    difficulty: Optional[str] = Field(default=None, index=True)
    metadata_json: Optional[str] = Field(default=None, description="Free-form JSON metadata")
