"""Prompt template schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class PromptTemplateCreate(BaseModel):
    name: str
    template: str
    system_prompt: Optional[str] = None
    version: int = 1
    notes: Optional[str] = None


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = None
    template: Optional[str] = None
    system_prompt: Optional[str] = None
    version: Optional[int] = None
    notes: Optional[str] = None


class PromptTemplateRead(BaseModel):
    id: int
    name: str
    template: str
    system_prompt: Optional[str] = None
    version: int
    created_at: datetime
    notes: Optional[str] = None


class PromptPreviewRequest(BaseModel):
    template: str
    system_prompt: Optional[str] = None
    sample_input: str = ""
    sample_reference: Optional[str] = None
    sample_category: Optional[str] = None
    sample_difficulty: Optional[str] = None


class PromptPreviewResponse(BaseModel):
    system_prompt: Optional[str] = None
    rendered_prompt: str
