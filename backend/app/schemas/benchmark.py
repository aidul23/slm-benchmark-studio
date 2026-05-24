"""Pydantic schemas for the /api/benchmarks router."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from .dataset import DatasetRead


class BenchmarkSubsetRead(BaseModel):
    key: str
    label: str
    description: Optional[str] = None


class BenchmarkInfo(BaseModel):
    key: str
    name: str
    description: str
    task_type: str
    default_split: str
    splits: List[str] = Field(default_factory=list)
    subsets: List[BenchmarkSubsetRead] = Field(default_factory=list)
    default_subset: Optional[str] = None
    suggested_limit: int = 100
    max_limit: int = 1000
    docs_url: Optional[str] = None


class BenchmarkCatalog(BaseModel):
    benchmarks: List[BenchmarkInfo] = Field(default_factory=list)


class BenchmarkImportRequest(BaseModel):
    benchmark: str
    subset: Optional[str] = None
    split: Optional[str] = None
    limit: int = 100
    offset: int = 0
    shuffle: bool = False
    seed: int = 0
    name: Optional[str] = None
    description: Optional[str] = None


class BenchmarkImportResponse(BaseModel):
    dataset: DatasetRead
    benchmark: str
    subset: Optional[str] = None
    split: Optional[str] = None
    fetched: int = 0
    imported: int = 0
    requested: int = 0
    source_url: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)
