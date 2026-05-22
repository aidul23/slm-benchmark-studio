"""Tiny client around the HuggingFace `datasets-server` REST API.

We avoid the heavy `datasets` Python package and instead paginate JSON rows
through the public datasets-server, which works for any dataset that ships a
parquet conversion (which both MMLU and HellaSwag do).
"""
from __future__ import annotations

import random
from typing import Any, Dict, Iterable, List, Optional, Tuple

import httpx


_BASE = "https://datasets-server.huggingface.co"
_PAGE_SIZE = 100  # datasets-server caps `length` at 100


class HFDatasetServerError(RuntimeError):
    pass


def fetch_rows(
    *,
    dataset: str,
    config: str,
    split: str,
    limit: int,
    offset: int = 0,
    shuffle: bool = False,
    seed: int = 0,
    timeout: float = 30.0,
) -> Tuple[List[Dict[str, Any]], str]:
    """Fetch up to `limit` rows from a dataset/config/split combination.

    Returns the raw `row` dicts plus a human-readable source URL for traceability.
    Raises `HFDatasetServerError` on any non-200 response.
    """
    if limit <= 0:
        return [], _build_url(dataset, config, split, offset, 0)
    if shuffle:
        # When shuffling we over-fetch from the first page-worth of pages and
        # subsample. The datasets-server doesn't have a server-side shuffle, so
        # we keep it light: sample from the first `max(limit * 5, 200)` rows.
        pool_target = max(limit * 5, 200)
        rows = _paginate(dataset=dataset, config=config, split=split, limit=pool_target, offset=offset, timeout=timeout)
        rng = random.Random(seed or 0)
        rng.shuffle(rows)
        rows = rows[:limit]
    else:
        rows = _paginate(dataset=dataset, config=config, split=split, limit=limit, offset=offset, timeout=timeout)

    return rows, _build_url(dataset, config, split, offset, limit)


def _paginate(
    *,
    dataset: str,
    config: str,
    split: str,
    limit: int,
    offset: int,
    timeout: float,
) -> List[Dict[str, Any]]:
    collected: List[Dict[str, Any]] = []
    remaining = limit
    cursor = offset
    with httpx.Client(timeout=timeout) as client:
        while remaining > 0:
            page = min(_PAGE_SIZE, remaining)
            params = {
                "dataset": dataset,
                "config": config,
                "split": split,
                "offset": cursor,
                "length": page,
            }
            try:
                response = client.get(f"{_BASE}/rows", params=params)
            except httpx.HTTPError as exc:
                raise HFDatasetServerError(f"HF datasets-server request failed: {exc}") from exc
            if response.status_code != 200:
                detail = _safe_detail(response)
                raise HFDatasetServerError(
                    f"HF datasets-server returned {response.status_code} for {dataset}/{config}/{split}: {detail}"
                )
            payload = response.json()
            rows = payload.get("rows") or []
            if not rows:
                break
            for entry in rows:
                row = entry.get("row")
                if isinstance(row, dict):
                    collected.append(row)
            cursor += len(rows)
            remaining -= len(rows)
            # Stop early if we've drained the split.
            if len(rows) < page:
                break
    return collected


def _safe_detail(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return response.text[:200]
    if isinstance(data, dict):
        for key in ("error", "message", "detail"):
            value = data.get(key)
            if isinstance(value, str):
                return value
    return str(data)[:200]


def _build_url(dataset: str, config: str, split: str, offset: int, limit: int) -> str:
    return f"{_BASE}/rows?dataset={dataset}&config={config}&split={split}&offset={offset}&length={limit}"


def iter_chunks(rows: Iterable[Dict[str, Any]], size: int) -> Iterable[List[Dict[str, Any]]]:
    chunk: List[Dict[str, Any]] = []
    for row in rows:
        chunk.append(row)
        if len(chunk) >= size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


def list_configs(dataset: str, *, timeout: float = 15.0) -> List[str]:
    """Return available configs (subsets) for a dataset, e.g. MMLU subjects."""
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.get(f"{_BASE}/splits", params={"dataset": dataset})
    except httpx.HTTPError as exc:
        raise HFDatasetServerError(f"HF datasets-server request failed: {exc}") from exc
    if response.status_code != 200:
        raise HFDatasetServerError(
            f"HF datasets-server returned {response.status_code} for {dataset}"
        )
    payload = response.json()
    configs: List[str] = []
    seen: set[str] = set()
    for entry in payload.get("splits") or []:
        config = entry.get("config")
        if isinstance(config, str) and config not in seen:
            configs.append(config)
            seen.add(config)
    return configs


def first_value(row: Dict[str, Any], *keys: str) -> Optional[Any]:
    for key in keys:
        if key in row and row[key] is not None:
            return row[key]
    return None
