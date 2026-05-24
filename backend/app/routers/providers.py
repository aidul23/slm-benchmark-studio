"""Endpoints for the judge-provider catalog and per-provider model discovery.

Security notes:
  - The API key is **never persisted** by this router. It travels in the
    request body, is forwarded to the upstream provider, and is then dropped
    when the response is returned.
  - We do not log the key. The few places that need a log breadcrumb use
    `mask_key()` so at most a `xxxx…yy` preview can appear in logs.
  - The catalog endpoint never echoes any key — only static metadata.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.providers import (
    ProviderError,
    get_provider,
    list_providers,
    mask_key,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/providers", tags=["providers"])


class ProviderInfoOut(BaseModel):
    key: str
    name: str
    description: str
    requires_api_key: bool
    docs_url: Optional[str] = None
    suggested_models: List[str] = Field(default_factory=list)


class ProviderModelOut(BaseModel):
    id: str
    name: str
    size: Optional[int] = None


class ListModelsRequest(BaseModel):
    api_key: Optional[str] = Field(
        default=None,
        description="Provider API key. Required for non-local providers; ignored for Ollama.",
    )


class ListModelsResponse(BaseModel):
    provider: str
    models: List[ProviderModelOut]


@router.get("", response_model=List[ProviderInfoOut])
def get_catalog() -> List[ProviderInfoOut]:
    """List provider metadata for the UI dropdown.

    Returns no secrets — purely static info plus a `requires_api_key` flag the
    frontend uses to decide whether to render the API-key field.
    """
    return [
        ProviderInfoOut(
            key=p.key,
            name=p.name,
            description=p.description,
            requires_api_key=p.requires_api_key,
            docs_url=p.docs_url,
            suggested_models=list(p.suggested_models),
        )
        for p in list_providers()
    ]


@router.post("/{provider_key}/models", response_model=ListModelsResponse)
async def list_models_for_provider(
    provider_key: str,
    payload: ListModelsRequest,
) -> ListModelsResponse:
    """Validate the supplied API key and return the model list for the provider.

    A successful response confirms the key is accepted by the upstream service.
    Errors are translated into `HTTPException`s whose `detail` is a stable
    `{code, message}` envelope the frontend turns into a toast.
    """
    provider = get_provider(provider_key)
    if provider is None:
        raise HTTPException(status_code=404, detail={"code": "unknown_provider", "message": f"Unknown provider '{provider_key}'"})

    api_key = (payload.api_key or "").strip() or None
    if provider.info.requires_api_key:
        logger.info(
            "Listing models for provider=%s with key=%s",
            provider_key,
            mask_key(api_key),
        )
    try:
        models = await provider.list_models(api_key)
    except ProviderError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected provider error (provider=%s)", provider_key)
        raise HTTPException(
            status_code=500,
            detail={"code": "internal_error", "message": "Unexpected error while contacting the provider."},
        ) from exc

    return ListModelsResponse(
        provider=provider.info.key,
        models=[ProviderModelOut(**_only_known_fields(m)) for m in models],
    )


def _only_known_fields(record: Dict[str, Any]) -> Dict[str, Any]:
    """Defensively keep only fields the schema expects (drop provider-specific extras)."""
    out: Dict[str, Any] = {"id": record["id"], "name": record.get("name") or record["id"]}
    if "size" in record and isinstance(record["size"], int):
        out["size"] = record["size"]
    return out
