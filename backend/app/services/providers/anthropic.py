"""Anthropic Claude (Messages API) provider.

Two quirks compared to OpenAI:
  - Authentication uses the `x-api-key` header (not Bearer), plus a required
    `anthropic-version` header.
  - System messages live in a top-level `system` field, not inside `messages`.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import httpx

from .base import ChatMessage, ChatProvider, ChatResult, ProviderError, ProviderInfo


_BASE = "https://api.anthropic.com/v1"
_VERSION = "2023-06-01"
_DEFAULT_MAX_TOKENS = 1024  # Anthropic *requires* max_tokens; we set a safe default.


def _ensure_key(api_key: Optional[str]) -> str:
    if not api_key or not api_key.strip():
        raise ProviderError(
            "Anthropic API key is required.",
            code="missing_api_key",
            status_code=400,
        )
    return api_key.strip()


def _headers(api_key: str) -> Dict[str, str]:
    return {
        "x-api-key": api_key,
        "anthropic-version": _VERSION,
        "Content-Type": "application/json",
    }


class AnthropicProvider(ChatProvider):
    info = ProviderInfo(
        key="anthropic",
        name="Anthropic (Claude)",
        description="Anthropic's Claude family (Sonnet, Opus, Haiku). Requires an API key from console.anthropic.com.",
        requires_api_key=True,
        docs_url="https://console.anthropic.com/settings/keys",
        suggested_models=["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"],
    )

    async def list_models(self, api_key: Optional[str]) -> List[Dict[str, Any]]:
        key = _ensure_key(api_key)
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(f"{_BASE}/models", headers=_headers(key))
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Could not reach Anthropic: {exc}",
                code="network_error",
                status_code=502,
            ) from exc

        if response.status_code in (401, 403):
            raise ProviderError(
                "Anthropic rejected the API key. Double-check it and try again.",
                code="invalid_api_key",
                status_code=401,
            )
        if response.status_code == 429:
            raise ProviderError(
                "Anthropic rate-limited the request. Wait a moment and retry.",
                code="rate_limited",
                status_code=429,
            )
        if response.status_code >= 400:
            raise ProviderError(
                _extract_error(response, default=f"Anthropic returned status {response.status_code}."),
                code="provider_error",
                status_code=502,
            )

        payload = response.json() or {}
        items: List[Dict[str, Any]] = []
        for entry in payload.get("data") or []:
            mid = entry.get("id")
            if isinstance(mid, str):
                items.append({"id": mid, "name": entry.get("display_name") or mid})
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

        # Anthropic wants system messages as a top-level `system` field, and
        # only "user"/"assistant" roles inside `messages`. Concatenate any
        # system messages preserving order.
        system_parts: List[str] = []
        chat_messages: List[Dict[str, str]] = []
        for msg in messages:
            if msg.role == "system":
                system_parts.append(msg.content)
            else:
                chat_messages.append({"role": msg.role, "content": msg.content})

        system_text = "\n\n".join(p for p in system_parts if p)
        if format_json and "json" not in system_text.lower():
            # Claude has no native JSON mode — nudge it via the system prompt.
            system_text = (system_text + "\n\n" if system_text else "") + (
                "Respond only with valid JSON. Do not include markdown fences or commentary."
            )

        body: Dict[str, Any] = {
            "model": model,
            "messages": chat_messages,
            "temperature": float(temperature),
            "max_tokens": int(max_tokens or _DEFAULT_MAX_TOKENS),
        }
        if system_text:
            body["system"] = system_text

        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(f"{_BASE}/messages", json=body, headers=_headers(key))
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Anthropic request failed: {exc}",
                code="network_error",
                status_code=502,
            ) from exc

        latency_ms = (time.perf_counter() - started) * 1000.0
        if response.status_code in (401, 403):
            raise ProviderError(
                "Anthropic rejected the API key during the run.",
                code="invalid_api_key",
                status_code=401,
            )
        if response.status_code >= 400:
            raise ProviderError(
                _extract_error(response, default=f"Anthropic returned status {response.status_code}."),
                code="provider_error",
                status_code=502,
            )

        data = response.json() or {}
        blocks = data.get("content") or []
        # `content` is a list of blocks like {type: "text", text: "..."}.
        content = "".join(b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text")
        usage = data.get("usage") or {}

        return ChatResult(
            content=content,
            latency_ms=latency_ms,
            prompt_tokens=usage.get("input_tokens"),
            completion_tokens=usage.get("output_tokens"),
            total_tokens=(
                (usage.get("input_tokens") or 0) + (usage.get("output_tokens") or 0)
                if usage
                else None
            ),
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
