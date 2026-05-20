"""Prompt template entity."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class PromptTemplate(SQLModel, table=True):
    __tablename__ = "prompt_templates"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    system_prompt: Optional[str] = Field(default=None)
    template: str = Field(description="User-message template with {{variable}} placeholders")
    version: int = Field(default=1)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    notes: Optional[str] = Field(default=None)
