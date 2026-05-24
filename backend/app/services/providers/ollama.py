"""Ollama provider — thin adapter over the existing OllamaClient."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..ollama_client import OllamaClient, OllamaError
from .base import ChatMessage, ChatProvider, ChatResult, ProviderError, ProviderInfo


class OllamaProvider(ChatProvider):
    info = ProviderInfo(
        key="ollama",
        name="Local (Ollama)",
        description="Models served by your local Ollama instance. No API key required.",
        requires_api_key=False,
        docs_url="https://ollama.com/",
    )

    def _client(self) -> OllamaClient:
        # The OllamaClient picks up its URL from settings; we don't cache the
        # instance because settings can change at runtime in dev.
        return OllamaClient()

    async def list_models(self, api_key: Optional[str]) -> List[Dict[str, Any]]:
        try:
            models = await self._client().list_models()
        except OllamaError as exc:
            raise ProviderError(
                f"Could not reach Ollama: {exc}",
                code="ollama_unavailable",
                status_code=503,
            ) from exc
        return [{"id": m["name"], "name": m["name"], "size": m.get("size")} for m in models]

    async def chat(
        self,
        *,
        api_key: Optional[str],
        model: str,
        messages: List[ChatMessage],
        temperature: float = 0.0,
        max_tokens: Optional[int] = None,
        format_json: bool = False,
    ) -> ChatResult:
        client = self._client()
        try:
            response = await client.chat(
                model=model,
                messages=[{"role": m.role, "content": m.content} for m in messages],
                temperature=temperature,
                max_tokens=max_tokens,
                format_json=format_json,
            )
        except OllamaError as exc:
            raise ProviderError(
                f"Ollama call failed: {exc}",
                code="ollama_error",
                status_code=502,
            ) from exc

        return ChatResult(
            content=response.content,
            latency_ms=response.latency_ms,
            prompt_tokens=response.prompt_eval_count,
            completion_tokens=response.eval_count,
            raw=response.raw,
        )
