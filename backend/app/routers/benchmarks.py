"""Endpoints for browsing and importing standard public benchmarks.

Importing a benchmark creates a regular `Dataset` + `DatasetExample` rows so the
rest of the platform (runs, judging, refinement, exports) works unchanged. The
examples carry a `metadata.task_type` flag that the BenchmarkRunner uses to
decide whether to also run the deterministic scorer alongside the LLM judge.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..database import get_session
from ..models.dataset import Dataset
from ..models.example import DatasetExample
from ..schemas.benchmark import (
    BenchmarkCatalog,
    BenchmarkImportRequest,
    BenchmarkImportResponse,
    BenchmarkInfo,
    BenchmarkSubsetRead,
)
from ..services.benchmark_loaders import LoaderRequest, catalog, get_loader
from ..services.benchmark_loaders.hf_client import HFDatasetServerError
from ..utils.jsonl import metadata_to_json
from ..workshop import ParticipantContext, get_participant, owner_key_for_create


router = APIRouter(prefix="/api/benchmarks", tags=["benchmarks"])


@router.get("/catalog", response_model=BenchmarkCatalog)
def get_catalog() -> BenchmarkCatalog:
    items = []
    for info in catalog():
        items.append(
            BenchmarkInfo(
                key=info.key,
                name=info.name,
                description=info.description,
                task_type=info.task_type,
                default_split=info.default_split,
                splits=info.splits,
                subsets=[BenchmarkSubsetRead(key=s.key, label=s.label, description=s.description) for s in info.subsets],
                default_subset=info.default_subset,
                suggested_limit=info.suggested_limit,
                max_limit=info.max_limit,
                docs_url=info.docs_url,
            )
        )
    return BenchmarkCatalog(benchmarks=items)


@router.post("/import", response_model=BenchmarkImportResponse)
def import_benchmark(
    payload: BenchmarkImportRequest,
    session: Session = Depends(get_session),
    participant: ParticipantContext = Depends(get_participant),
) -> BenchmarkImportResponse:
    loader = get_loader(payload.benchmark)
    if loader is None:
        raise HTTPException(status_code=400, detail=f"Unknown benchmark '{payload.benchmark}'")

    request = LoaderRequest(
        subset=payload.subset,
        split=payload.split,
        limit=max(1, payload.limit or 0),
        offset=max(0, payload.offset or 0),
        shuffle=bool(payload.shuffle),
        seed=int(payload.seed or 0),
    )

    try:
        result = loader(request)
    except HFDatasetServerError as exc:
        raise HTTPException(status_code=502, detail=f"HuggingFace fetch failed: {exc}") from exc

    if not result.examples:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Loader returned no examples — try a different subset or split.",
                "warnings": result.warnings,
                "source_url": result.source_url,
            },
        )

    dataset_name = payload.name or _default_name(payload, result.fetched)
    description = payload.description or _default_description(payload, result)
    dataset = Dataset(
        name=dataset_name,
        description=description,
        owner_key=owner_key_for_create(participant),
    )
    session.add(dataset)
    session.commit()
    session.refresh(dataset)

    for parsed in result.examples:
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

    return BenchmarkImportResponse(
        dataset=_to_dataset_read(session, dataset),
        benchmark=payload.benchmark,
        subset=payload.subset,
        split=payload.split,
        fetched=result.fetched,
        imported=len(result.examples),
        requested=result.requested,
        source_url=result.source_url,
        warnings=result.warnings,
    )


def _default_name(payload: BenchmarkImportRequest, fetched: int) -> str:
    parts = [payload.benchmark]
    if payload.subset and payload.subset != "all" and payload.subset != "default":
        parts.append(payload.subset)
    if payload.split:
        parts.append(payload.split)
    parts.append(f"n{fetched or payload.limit}")
    return "-".join(parts)


def _default_description(payload: BenchmarkImportRequest, result) -> str:  # type: ignore[no-untyped-def]
    bits = [f"Imported from {payload.benchmark}"]
    if payload.subset:
        bits.append(f"subset={payload.subset}")
    if payload.split:
        bits.append(f"split={payload.split}")
    if result.source_url:
        bits.append(result.source_url)
    return " · ".join(bits)


def _to_dataset_read(session: Session, dataset: Dataset):
    # Import locally to avoid a circular dependency with the datasets router helpers.
    from .datasets import _to_dataset_read as helper

    return helper(session, dataset)
