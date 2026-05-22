"""OpenAI Chat Completions provider."""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import httpx

from .base import ChatMessage, ChatProvider, ChatResult, ProviderError, ProviderInfo


_BASE = "https://api.openai.com/v1"
# We surface every model that's plausibly a chat model. The /v1/models endpoint
# also returns embeddings, image, audio, etc. — we filter those out below.
_CHAT_PREFIXES = ("gpt-", "o1", "o3", "o4", "chatgpt-")
_EXCLUDE_SUBSTR = ("embed", "audio", "tts", "whisper", "image", "moderation", "search", "realtime")


def _headers(api_key: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def _ensure_key(api_key: Optional[str]) -> str:
    if not api_key or not api_key.strip():
        raise ProviderError(
            "OpenAI API key is required.",
            code="missing_api_key",
            status_code=400,
        )
    return api_key.strip()


class OpenAIProvider(ChatProvider):
    info = ProviderInfo(
        key="openai",
        name="OpenAI",
        description="OpenAI's hosted models (GPT-4o, GPT-4.1, o-series, …). Requires an API key from platform.openai.com.",
        requires_api_key=True,
        docs_url="https://platform.openai.com/api-keys",
        suggested_models=["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "o3-mini"],
    )

    async def list_models(self, api_key: Optional[str]) -> List[Dict[str, Any]]:
        key = _ensure_key(api_key)
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(f"{_BASE}/models", headers=_headers(key))
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Could not reach OpenAI: {exc}",
                code="network_error",
                status_code=502,
            ) from exc

        if response.status_code == 401:
            raise ProviderError(
                "OpenAI rejected the API key. Double-check it and try again.",
                code="invalid_api_key",
                status_code=401,
            )
        if response.status_code == 429:
            raise ProviderError(
                "OpenAI rate-limited the request. Wait a moment and retry.",
                code="rate_limited",
                status_code=429,
            )
        if response.status_code >= 400:
            raise ProviderError(
                _extract_error(response, default=f"OpenAI returned status {response.status_code}."),
                code="provider_error",
                status_code=502,
            )

        payload = response.json() or {}
        items: List[Dict[str, Any]] = []
        for entry in payload.get("data") or []:
            mid = entry.get("id")
            if not isinstance(mid, str):
                continue
            if not any(mid.startswith(p) for p in _CHAT_PREFIXES):
                continue
            if any(bad in mid for bad in _EXCLUDE_SUBSTR):
                continue
            items.append({"id": mid, "name": mid})
        # Most-recently-created last in OpenAI's response — keep stable, alpha sort.
        items.sort(key=lambda m: m["id"])
        return items

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
        key = _ensure_key(api_key)
        body: Dict[str, Any] = {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": float(temperature),
        }
        if max_tokens:
            body["max_tokens"] = int(max_tokens)
        if format_json:
            body["response_format"] = {"type": "json_object"}

        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(f"{_BASE}/chat/completions", json=body, headers=_headers(key))
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"OpenAI request failed: {exc}",
                code="network_error",
                status_code=502,
            ) from exc

        latency_ms = (time.perf_counter() - started) * 1000.0
        if response.status_code == 401:
            raise ProviderError(
                "OpenAI rejected the API key during the run.",
                code="invalid_api_key",
                status_code=401,
            )
        if response.status_code >= 400:
            raise ProviderError(
                _extract_error(response, default=f"OpenAI returned status {response.status_code}."),
                code="provider_error",
                status_code=502,
            )

        data = response.json() or {}
        choices = data.get("choices") or []
        message = (choices[0].get("message") if choices else {}) or {}
        content = message.get("content") or ""
        usage = data.get("usage") or {}

        return ChatResult(
            content=content,
            latency_ms=latency_ms,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            total_tokens=usage.get("total_tokens"),
            raw=data,
        )


def _extract_error(response: httpx.Response, *, default: str) -> str:
    try:
        payload = response.json()
    except ValueError:
        return default
    if isinstance(payload, dict):
        err = payload.get("error")
        if isinstance(err, dict):
            msg = err.get("message")
            if isinstance(msg, str) and msg.strip():
                return msg.strip()
        msg = payload.get("message")
        if isinstance(msg, str) and msg.strip():
            return msg.strip()
    return default
