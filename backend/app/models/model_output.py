"""Per-example model output entity."""
from __future__ import annotations

from typing import Optional

from sqlmodel import Field, SQLModel


class ModelOutput(SQLModel, table=True):
    __tablename__ = "model_outputs"

    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="benchmark_runs.id", index=True)
    example_id: int = Field(foreign_key="dataset_examples.id", index=True)
    model_name: str = Field(index=True)
    input: str
    rendered_prompt: str
    reference: Optional[str] = Field(default=None)
    output: Optional[str] = Field(default=None)
    latency_ms: Optional[float] = Field(default=None)
    # Ollama timing stats (nanoseconds in the API)
    total_duration: Optional[int] = Field(default=None)
    load_duration: Optional[int] = Field(default=None)
    prompt_eval_count: Optional[int] = Field(default=None)
    prompt_eval_duration: Optional[int] = Field(default=None)
    eval_count: Optional[int] = Field(default=None)
    eval_duration: Optional[int] = Field(default=None)
    tokens_per_second: Optional[float] = Field(default=None)
    error: Optional[str] = Field(default=None)
