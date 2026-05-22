"""Chat providers (Ollama local + proprietary cloud APIs).

The `ChatProvider` interface lets the `JudgeRunner` (and any future caller) stay
agnostic about *where* the LLM lives. Each concrete provider implements the same
narrow contract: list available models, and chat with a model.

API keys are **never persisted** by this package. Functions accept the key as a
parameter and never log it. The router layer (`routers/providers.py`) is the
only entry point that receives keys from the user, and it forwards them as-is
without writing to disk or to log streams.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .anthropic import AnthropicProvider
from .base import (
    ChatMessage,
    ChatProvider,
    ChatResult,
    ProviderError,
    ProviderInfo,
    mask_key,
)
from .gemini import GeminiProvider
from .ollama import OllamaProvider
from .openai_provider import OpenAIProvider


_PROVIDERS: Dict[str, ChatProvider] = {
    "ollama": OllamaProvider(),
    "openai": OpenAIProvider(),
    "anthropic": AnthropicProvider(),
    "gemini": GeminiProvider(),
}


def get_provider(key: str) -> Optional[ChatProvider]:
    return _PROVIDERS.get((key or "").strip().lower())


def list_providers() -> List[ProviderInfo]:
    return [p.info for p in _PROVIDERS.values()]


__all__ = [
    "ChatMessage",
    "ChatProvider",
    "ChatResult",
    "ProviderError",
    "ProviderInfo",
    "get_provider",
    "list_providers",
    "mask_key",
]
