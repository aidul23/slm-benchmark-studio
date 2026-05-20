"""Result and insights schemas."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class JudgeScoreRead(BaseModel):
    judge_model: Optional[str] = None
    correctness: Optional[float] = None
    factuality: Optional[float] = None
    completeness: Optional[float] = None
    conciseness: Optional[float] = None
    instruction_following: Optional[float] = None
    overall: Optional[float] = None
    reason: Optional[str] = None
    parse_error: Optional[str] = None
    human_score: Optional[float] = None
    human_notes: Optional[str] = None
    accepted_judge_score: Optional[bool] = None


class ResultRow(BaseModel):
    output_id: int
    run_id: int
    example_id: int
    external_id: Optional[str] = None
    model_name: str
    input: str
    reference: Optional[str] = None
    output: Optional[str] = None
    rendered_prompt: Optional[str] = None
    latency_ms: Optional[float] = None
    tokens_per_second: Optional[float] = None
    prompt_eval_count: Optional[int] = None
    eval_count: Optional[int] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    error: Optional[str] = None
    judge: Optional[JudgeScoreRead] = None


class ModelSummary(BaseModel):
    model_name: str
    count: int = 0
    error_count: int = 0
    parse_error_count: int = 0
    avg_latency_ms: Optional[float] = None
    p50_latency_ms: Optional[float] = None
    p95_latency_ms: Optional[float] = None
    avg_tokens_per_second: Optional[float] = None
    avg_correctness: Optional[float] = None
    avg_factuality: Optional[float] = None
    avg_completeness: Optional[float] = None
    avg_conciseness: Optional[float] = None
    avg_instruction_following: Optional[float] = None
    avg_overall: Optional[float] = None


class RunSummary(BaseModel):
    run_id: int
    total_examples: int
    total_outputs: int
    by_model: List[ModelSummary] = Field(default_factory=list)
    by_category: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    by_difficulty: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    worst_examples: List[ResultRow] = Field(default_factory=list)


class InsightsOverview(BaseModel):
    total_datasets: int
    total_runs: int
    total_outputs: int
    best_model_by_overall: Optional[Dict[str, Any]] = None
    fastest_model_by_latency: Optional[Dict[str, Any]] = None
    recent_runs: List[Dict[str, Any]] = Field(default_factory=list)
    by_model: List[ModelSummary] = Field(default_factory=list)


class HumanReviewUpdate(BaseModel):
    human_score: Optional[float] = None
    human_notes: Optional[str] = None
    accepted_judge_score: Optional[bool] = None
