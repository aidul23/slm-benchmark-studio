"""Judge score entity."""
from __future__ import annotations

from typing import Optional

from sqlmodel import Field, SQLModel


class JudgeScore(SQLModel, table=True):
    __tablename__ = "judge_scores"

    id: Optional[int] = Field(default=None, primary_key=True)
    model_output_id: int = Field(foreign_key="model_outputs.id", index=True, unique=True)
    judge_model: str = Field(index=True)
    correctness: Optional[float] = Field(default=None)
    factuality: Optional[float] = Field(default=None)
    completeness: Optional[float] = Field(default=None)
    conciseness: Optional[float] = Field(default=None)
    instruction_following: Optional[float] = Field(default=None)
    overall: Optional[float] = Field(default=None)
    reason: Optional[str] = Field(default=None)
    raw_judge_output: Optional[str] = Field(default=None)
    parse_error: Optional[str] = Field(default=None)

    # Optional human review (added per the article's recommendation to spot-check judges).
    human_score: Optional[float] = Field(default=None)
    human_notes: Optional[str] = Field(default=None)
    accepted_judge_score: Optional[bool] = Field(default=None)
