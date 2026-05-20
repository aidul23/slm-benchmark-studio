"""Endpoints for inspecting local Ollama models."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter

from ..services.ollama_client import OllamaClient, OllamaError


router = APIRouter(prefix="/api/ollama", tags=["ollama"])


@router.get("/models")
async def list_models() -> Dict[str, Any]:
    """Return locally installed Ollama models, or an empty list with an error message."""
    client = OllamaClient()
    try:
        models: List[Dict[str, Any]] = await client.list_models()
        return {"available": True, "models": models, "error": None}
    except OllamaError as exc:
        return {"available": False, "models": [], "error": str(exc)}


@router.get("/health")
async def health() -> Dict[str, Any]:
    client = OllamaClient()
    available = await client.health()
    return {"available": available, "base_url": client.base_url}
