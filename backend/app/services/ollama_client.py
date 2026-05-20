"""Thin async wrapper around the Ollama HTTP API."""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx

from ..config import get_settings


@dataclass
class ChatResponse:
    """Normalized response from `/api/chat`."""

    content: str
    latency_ms: float
    total_duration: Optional[int] = None
    load_duration: Optional[int] = None
    prompt_eval_count: Optional[int] = None
    prompt_eval_duration: Optional[int] = None
    eval_count: Optional[int] = None
    eval_duration: Optional[int] = None
    raw: Optional[Dict[str, Any]] = None

    @property
    def tokens_per_second(self) -> Optional[float]:
        if self.eval_count and self.eval_duration and self.eval_duration > 0:
            return float(self.eval_count) / (self.eval_duration / 1_000_000_000)
        return None


class OllamaError(RuntimeError):
    """Raised when the Ollama backend returns an error or cannot be reached."""


class OllamaClient:
    """Small client around the local Ollama HTTP API.

    The official Ollama docs describe `/api/tags`, `/api/chat`, and `/api/generate`.
    We use `stream=False` so each response is a single JSON document we can parse directly.
    """

    def __init__(self, base_url: Optional[str] = None, timeout: Optional[float] = None) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.timeout = timeout if timeout is not None else float(settings.default_timeout_seconds)

    async def list_models(self) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/api/tags"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise OllamaError(f"Failed to list models from {url}: {exc}") from exc

        payload = response.json()
        models = payload.get("models") or []
        normalized: List[Dict[str, Any]] = []
        for entry in models:
            normalized.append(
                {
                    "name": entry.get("name") or entry.get("model"),
                    "size": entry.get("size"),
                    "modified_at": entry.get("modified_at"),
                    "details": entry.get("details"),
                }
            )
        return [m for m in normalized if m["name"]]

    async def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        *,
        temperature: float = 0.2,
        max_tokens: Optional[int] = None,
        options: Optional[Dict[str, Any]] = None,
        format_json: bool = False,
        timeout: Optional[float] = None,
    ) -> ChatResponse:
        url = f"{self.base_url}/api/chat"
        opts: Dict[str, Any] = {"temperature": float(temperature)}
        if max_tokens is not None:
            # Ollama uses `num_predict` for max generation length.
            opts["num_predict"] = int(max_tokens)
        if options:
            opts.update(options)

        body: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
            "options": opts,
        }
        if format_json:
            body["format"] = "json"

        started = time.perf_counter()
        effective_timeout = timeout if timeout is not None else self.timeout
        try:
            async with httpx.AsyncClient(timeout=effective_timeout) as client:
                response = await client.post(url, json=body)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise OllamaError(f"Ollama chat call failed: {exc}") from exc

        elapsed_ms = (time.perf_counter() - started) * 1000.0
        data = response.json()
        message = data.get("message") or {}
        content = message.get("content") or ""

        return ChatResponse(
            content=content,
            latency_ms=elapsed_ms,
            total_duration=data.get("total_duration"),
            load_duration=data.get("load_duration"),
            prompt_eval_count=data.get("prompt_eval_count"),
            prompt_eval_duration=data.get("prompt_eval_duration"),
            eval_count=data.get("eval_count"),
            eval_duration=data.get("eval_duration"),
            raw=data,
        )

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                return response.status_code == 200
        except httpx.HTTPError:
            return False
