"""Dataset CRUD + JSONL upload endpoints."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func
from sqlmodel import Session, select

from ..database import get_session
from ..models.dataset import Dataset
from ..models.example import DatasetExample
from ..schemas.dataset import (
    DatasetCreate,
    DatasetDetail,
    DatasetRead,
    DatasetUploadResponse,
    ExampleCreate,
    ExampleRead,
)
from ..utils.jsonl import metadata_from_json, metadata_to_json, parse_jsonl


router = APIRouter(prefix="/api/datasets", tags=["datasets"])


def _dataset_kind(session: Session, dataset_id: int) -> str:
    """Return 'benchmark' if any example has metadata.task_type, else 'general'."""
    rows = session.exec(
        select(DatasetExample)
        .where(DatasetExample.dataset_id == dataset_id)
        .limit(50)
    ).all()
    for row in rows:
        meta = metadata_from_json(row.metadata_json) or {}
        if meta.get("task_type"):
            return "benchmark"
    return "general"


def _to_dataset_read(session: Session, dataset: Dataset) -> DatasetRead:
    count = session.exec(
        select(func.count(DatasetExample.id)).where(DatasetExample.dataset_id == dataset.id)
    ).one()
    if isinstance(count, tuple):
        count = count[0]
    return DatasetRead(
        id=dataset.id or 0,
        name=dataset.name,
        description=dataset.description,
        created_at=dataset.created_at,
        example_count=int(count or 0),
        kind=_dataset_kind(session, dataset.id or 0),
    )


def _example_to_read(example: DatasetExample) -> ExampleRead:
    return ExampleRead(
        id=example.id or 0,
        dataset_id=example.dataset_id,
        external_id=example.external_id,
        input=example.input,
        reference=example.reference,
        category=example.category,
        difficulty=example.difficulty,
        metadata=metadata_from_json(example.metadata_json),
    )


@router.get("", response_model=List[DatasetRead])
def list_datasets(session: Session = Depends(get_session)) -> List[DatasetRead]:
    datasets = session.exec(select(Dataset).order_by(Dataset.created_at.desc())).all()
    return [_to_dataset_read(session, d) for d in datasets]


@router.post("", response_model=DatasetRead)
def create_dataset(payload: DatasetCreate, session: Session = Depends(get_session)) -> DatasetRead:
    dataset = Dataset(name=payload.name, description=payload.description)
    session.add(dataset)
    session.commit()
    session.refresh(dataset)
    return _to_dataset_read(session, dataset)


@router.post("/upload", response_model=DatasetUploadResponse)
async def upload_dataset(
    file: UploadFile = File(...),
    name: Optional[str] = Form(default=None),
    description: Optional[str] = Form(default=None),
    session: Session = Depends(get_session),
) -> DatasetUploadResponse:
    raw = await file.read()
    parse_result = parse_jsonl(raw)
    if not parse_result.examples:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "No valid examples found in the uploaded file.",
                "errors": parse_result.errors,
            },
        )

    dataset_name = name or (file.filename or "dataset").rsplit(".", 1)[0]
    dataset = Dataset(name=dataset_name, description=description)
    session.add(dataset)
    session.commit()
    session.refresh(dataset)

    for parsed in parse_result.examples:
        session.add(
            DatasetExample(
                dataset_id=dataset.id or 0,
                external_id=parsed.external_id,
                input=parsed.input,
                reference=parsed.reference,
                category=parsed.category,
                difficulty=parsed.difficulty,
                metadata_json=metadata_to_json(parsed.metadata),
            )
        )
    session.commit()

    return DatasetUploadResponse(
        dataset=_to_dataset_read(session, dataset),
        parsed=len(parse_result.examples),
        skipped=parse_result.skipped,
        errors=parse_result.errors[:25],
    )


@router.get("/{dataset_id}", response_model=DatasetDetail)
def get_dataset(dataset_id: int, session: Session = Depends(get_session)) -> DatasetDetail:
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    examples = session.exec(
        select(DatasetExample).where(DatasetExample.dataset_id == dataset_id).order_by(DatasetExample.id)
    ).all()
    base = _to_dataset_read(session, dataset)
    return DatasetDetail(
        **base.model_dump(),
        examples=[_example_to_read(e) for e in examples],
    )


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: int, session: Session = Depends(get_session)) -> dict:
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    examples = session.exec(select(DatasetExample).where(DatasetExample.dataset_id == dataset_id)).all()
    for example in examples:
        session.delete(example)
    session.delete(dataset)
    session.commit()
    return {"ok": True}


@router.post("/{dataset_id}/examples", response_model=ExampleRead)
def add_example(
    dataset_id: int,
    payload: ExampleCreate,
    session: Session = Depends(get_session),
) -> ExampleRead:
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    example = DatasetExample(
        dataset_id=dataset_id,
        external_id=payload.external_id,
        input=payload.input,
        reference=payload.reference,
        category=payload.category,
        difficulty=payload.difficulty,
        metadata_json=metadata_to_json(payload.metadata),
    )
    session.add(example)
    session.commit()
    session.refresh(example)
    return _example_to_read(example)


@router.delete("/{dataset_id}/examples/{example_id}")
def delete_example(
    dataset_id: int,
    example_id: int,
    session: Session = Depends(get_session),
) -> dict:
    example = session.get(DatasetExample, example_id)
    if example is None or example.dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Example not found")
    session.delete(example)
    session.commit()
    return {"ok": True}
