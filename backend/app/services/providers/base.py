"""Shared types + base class for chat providers."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class ChatResult:
    """Normalized response shape across providers.

    Mirrors `services.ollama_client.ChatResponse` so the `JudgeRunner` only sees
    one shape regardless of where the model lives.
    """

    content: str
    latency_ms: float
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    raw: Optional[Dict[str, Any]] = None


@dataclass
class ProviderInfo:
    """Public-facing metadata for the UI / catalog endpoint."""

    key: str
    name: str
    description: str
    requires_api_key: bool
    docs_url: Optional[str] = None
    suggested_models: List[str] = field(default_factory=list)


class ProviderError(RuntimeError):
    """Raised by every provider when something goes wrong.

    The frontend turns `code` + `message` into a toast. We keep the messages
    deliberately user-friendly so they can be displayed verbatim.
    """

    def __init__(
        self,
        message: str,
        *,
        code: str = "provider_error",
        status_code: int = 502,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.details = details or {}


class ChatProvider:
    """Interface every concrete provider implements.

    Subclasses MUST NOT log raw `api_key` values. Use `mask_key()` if a key
    must appear in a log line at all.
    """

    info: ProviderInfo

    async def list_models(self, api_key: Optional[str]) -> List[Dict[str, Any]]:
        raise NotImplementedError

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
        raise NotImplementedError


def mask_key(key: Optional[str]) -> str:
    """Return a redacted preview of an API key for logs / errors.

    Never reveals more than the first 4 and last 2 characters, and only when
    the key is long enough to be uniquely identifiable.
    """
    if not key:
        return "<missing>"
    s = str(key)
    if len(s) <= 8:
        return "***"
    return f"{s[:4]}…{s[-2:]}"
