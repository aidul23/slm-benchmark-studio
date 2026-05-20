"""Benchmark run endpoints (create, list, start, results, summary, export)."""
from __future__ import annotations

import json
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlmodel import Session, select

from ..database import get_session
from ..models.benchmark_run import BenchmarkRun, RunStatus
from ..models.dataset import Dataset
from ..models.judge_score import JudgeScore
from ..models.model_output import ModelOutput
from ..models.prompt_template import PromptTemplate
from ..schemas.result import (
    HumanReviewUpdate,
    ResultRow,
    RunSummary,
)
from ..schemas.run import RunCreate, RunRead, RunUpdate
from ..services import metrics
from ..services.benchmark_runner import start_run_background
from ..services.export_service import run_results_to_csv


router = APIRouter(prefix="/api/runs", tags=["runs"])


def _to_read(run: BenchmarkRun) -> RunRead:
    selected = json.loads(run.selected_models_json) if run.selected_models_json else []
    config = json.loads(run.config_json) if run.config_json else None
    return RunRead(
        id=run.id or 0,
        name=run.name,
        dataset_id=run.dataset_id,
        prompt_template_id=run.prompt_template_id,
        selected_models=selected,
        judge_model=run.judge_model,
        status=run.status,
        created_at=run.created_at,
        started_at=run.started_at,
        completed_at=run.completed_at,
        progress_total=run.progress_total,
        progress_done=run.progress_done,
        current_phase=run.current_phase,
        current_activity=run.current_activity,
        export_path=run.export_path,
        error=run.error,
        config=config,
        notes=run.notes,
    )


@router.get("", response_model=List[RunRead])
def list_runs(session: Session = Depends(get_session)) -> List[RunRead]:
    runs = session.exec(select(BenchmarkRun).order_by(BenchmarkRun.created_at.desc())).all()
    return [_to_read(r) for r in runs]


@router.post("", response_model=RunRead)
def create_run(payload: RunCreate, session: Session = Depends(get_session)) -> RunRead:
    dataset = session.get(Dataset, payload.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=400, detail="Dataset not found")
    template = session.get(PromptTemplate, payload.prompt_template_id)
    if template is None:
        raise HTTPException(status_code=400, detail="Prompt template not found")
    if not payload.selected_models:
        raise HTTPException(status_code=400, detail="Select at least one model")

    config = {
        "temperature": payload.temperature,
        "max_tokens": payload.max_tokens,
        "repeats": payload.repeats,
    }
    run = BenchmarkRun(
        name=payload.name,
        dataset_id=payload.dataset_id,
        prompt_template_id=payload.prompt_template_id,
        selected_models_json=json.dumps(payload.selected_models),
        judge_model=payload.judge_model,
        config_json=json.dumps(config),
        notes=payload.notes,
        status=RunStatus.PENDING,
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    return _to_read(run)


@router.get("/{run_id}", response_model=RunRead)
def get_run(run_id: int, session: Session = Depends(get_session)) -> RunRead:
    run = session.get(BenchmarkRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return _to_read(run)


@router.patch("/{run_id}", response_model=RunRead)
def update_run(run_id: int, payload: RunUpdate, session: Session = Depends(get_session)) -> RunRead:
    run = session.get(BenchmarkRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(run, key, value)
    session.add(run)
    session.commit()
    session.refresh(run)
    return _to_read(run)


@router.post("/{run_id}/start", response_model=RunRead)
def start_run(
    run_id: int,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> RunRead:
    run = session.get(BenchmarkRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status == RunStatus.RUNNING:
        raise HTTPException(status_code=409, detail="Run already in progress")

    run.status = RunStatus.PENDING
    run.error = None
    run.progress_done = 0
    run.current_phase = None
    run.current_activity = "Queued"
    run.export_path = None
    session.add(run)
    session.commit()
    session.refresh(run)

    background_tasks.add_task(start_run_background, run_id)
    return _to_read(run)


@router.delete("/{run_id}")
def delete_run(run_id: int, session: Session = Depends(get_session)) -> dict:
    run = session.get(BenchmarkRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    outputs = session.exec(select(ModelOutput).where(ModelOutput.run_id == run_id)).all()
    output_ids = [o.id for o in outputs if o.id is not None]
    if output_ids:
        for score in session.exec(select(JudgeScore).where(JudgeScore.model_output_id.in_(output_ids))):  # type: ignore[arg-type]
            session.delete(score)
    for output in outputs:
        session.delete(output)
    session.delete(run)
    session.commit()
    return {"ok": True}


@router.get("/{run_id}/results", response_model=List[ResultRow])
def get_results(run_id: int, session: Session = Depends(get_session)) -> List[ResultRow]:
    run = session.get(BenchmarkRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return metrics.fetch_result_rows(session, run_id)


@router.get("/{run_id}/summary", response_model=RunSummary)
def get_summary(run_id: int, session: Session = Depends(get_session)) -> RunSummary:
    run = session.get(BenchmarkRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return metrics.build_run_summary(session, run_id)


@router.post("/{run_id}/outputs/{output_id}/review")
def update_human_review(
    run_id: int,
    output_id: int,
    payload: HumanReviewUpdate,
    session: Session = Depends(get_session),
) -> dict:
    output = session.get(ModelOutput, output_id)
    if output is None or output.run_id != run_id:
        raise HTTPException(status_code=404, detail="Output not found")
    score = session.exec(select(JudgeScore).where(JudgeScore.model_output_id == output_id)).first()
    if score is None:
        score = JudgeScore(model_output_id=output_id, judge_model="manual")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(score, key, value)
    session.add(score)
    session.commit()
    return {"ok": True}


@router.get("/{run_id}/export.csv")
def export_run_csv(run_id: int, session: Session = Depends(get_session)) -> Response:
    run = session.get(BenchmarkRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    payload = run_results_to_csv(session, run_id)
    return Response(
        content=payload,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=run_{run_id}_results.csv"},
    )
