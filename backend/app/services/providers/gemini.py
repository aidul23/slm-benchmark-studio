"""Google Gemini (Generative Language) provider.

Gemini's REST API is shaped differently from OpenAI / Anthropic:
  - Authentication is via a `?key=` query parameter (the API key never goes
    into the URL path or headers from us — we attach it as a query param at
    request time).
  - Messages are called `contents` and each one has `parts: [{text: ...}]`.
  - System prompts go in a top-level `systemInstruction` field.
  - Model identifiers are returned as `models/gemini-...`; we strip the prefix
    so the UI shows just `gemini-...`.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import httpx

from .base import ChatMessage, ChatProvider, ChatResult, ProviderError, ProviderInfo


_BASE = "https://generativelanguage.googleapis.com/v1beta"
_MODEL_PREFIX = "models/"


def _ensure_key(api_key: Optional[str]) -> str:
    if not api_key or not api_key.strip():
        raise ProviderError(
            "Google AI Studio API key is required.",
            code="missing_api_key",
            status_code=400,
        )
    return api_key.strip()


class GeminiProvider(ChatProvider):
    info = ProviderInfo(
        key="gemini",
        name="Google Gemini",
        description="Google's Gemini family via AI Studio. Requires an API key from aistudio.google.com.",
        requires_api_key=True,
        docs_url="https://aistudio.google.com/app/apikey",
        suggested_models=["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"],
    )

    async def list_models(self, api_key: Optional[str]) -> List[Dict[str, Any]]:
        key = _ensure_key(api_key)
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(f"{_BASE}/models", params={"key": key})
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Could not reach Google AI: {exc}",
                code="network_error",
                status_code=502,
            ) from exc

        _raise_for_status(response)

        payload = response.json() or {}
        items: List[Dict[str, Any]] = []
        for entry in payload.get("models") or []:
            name = entry.get("name") or ""
            mid = name[len(_MODEL_PREFIX):] if name.startswith(_MODEL_PREFIX) else name
            if not mid.startswith("gemini"):
                continue
            # Only surface models that support `generateContent` so the UI can
            # safely point the judge at them.
            methods = entry.get("supportedGenerationMethods") or []
            if methods and "generateContent" not in methods:
                continue
            items.append({"id": mid, "name": entry.get("displayName") or mid})
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

        # Split system from chat messages; Gemini takes the system prompt as
        # a top-level `systemInstruction` field.
        system_parts: List[str] = []
        contents: List[Dict[str, Any]] = []
        for msg in messages:
            if msg.role == "system":
                system_parts.append(msg.content)
            else:
                # Gemini's roles are "user" / "model" (not "assistant").
                role = "user" if msg.role == "user" else "model"
                contents.append({"role": role, "parts": [{"text": msg.content}]})

        body: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": float(temperature),
            },
        }
        if max_tokens:
            body["generationConfig"]["maxOutputTokens"] = int(max_tokens)
        if format_json:
            body["generationConfig"]["responseMimeType"] = "application/json"
        if system_parts:
            body["systemInstruction"] = {"parts": [{"text": "\n\n".join(system_parts)}]}

        url = f"{_BASE}/models/{model}:generateContent"
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(url, params={"key": key}, json=body)
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Google AI request failed: {exc}",
                code="network_error",
                status_code=502,
            ) from exc

        latency_ms = (time.perf_counter() - started) * 1000.0
        _raise_for_status(response)

        data = response.json() or {}
        candidates = data.get("candidates") or []
        first = candidates[0] if candidates else {}
        parts = ((first.get("content") or {}).get("parts")) or []
        content = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
        usage = data.get("usageMetadata") or {}

        return ChatResult(
            content=content,
            latency_ms=latency_ms,
            prompt_tokens=usage.get("promptTokenCount"),
            completion_tokens=usage.get("candidatesTokenCount"),
            total_tokens=usage.get("totalTokenCount"),
            raw=data,
        )


def _parse_error(response: httpx.Response) -> tuple[str, str]:
    """Extract `(message, reason)` from a Google AI error response.

    Google replies with `{error: {message, status, details: [{reason, ...}]}}`.
    `reason` is the most reliable signal — e.g. `API_KEY_INVALID` — but it
    isn't always populated, so we fall back to the message.
    """
    try:
        payload = response.json()
    except ValueError:
        return (f"Google AI returned status {response.status_code}.", "")
    err = (payload or {}).get("error") if isinstance(payload, dict) else None
    if not isinstance(err, dict):
        return (f"Google AI returned status {response.status_code}.", "")
    message = err.get("message") if isinstance(err.get("message"), str) else None
    reason = ""
    for detail in err.get("details") or []:
        if isinstance(detail, dict) and isinstance(detail.get("reason"), str):
            reason = detail["reason"]
            break
    return (message or f"Google AI returned status {response.status_code}.", reason)


def _raise_for_status(response: httpx.Response) -> None:
    """Translate a non-2xx Google AI response into a `ProviderError`.

    Google returns HTTP 400 (not 401) for invalid keys, so we sniff the
    response body for `API_KEY_INVALID` to surface the right error code.
    """
    if response.status_code < 400:
        return

    message, reason = _parse_error(response)

    if response.status_code in (401, 403) or reason == "API_KEY_INVALID" or "api key not valid" in message.lower():
        raise ProviderError(
            "Google AI rejected the API key. Double-check it and try again.",
            code="invalid_api_key",
            status_code=401,
        )
    if response.status_code == 429 or reason == "RATE_LIMIT_EXCEEDED":
        raise ProviderError(
            "Google AI rate-limited the request. Wait a moment and retry.",
            code="rate_limited",
            status_code=429,
        )
    raise ProviderError(message, code="provider_error", status_code=502)
