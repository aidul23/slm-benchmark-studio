"""Application configuration loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings backed by `.env` and process environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    ollama_base_url: str = "http://localhost:11434"
    database_url: str = "sqlite:///./slm_benchmark.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    default_timeout_seconds: int = 300
    default_temperature: float = 0.2
    default_max_tokens: int = 512
    exports_dir: str = "../data/exports"

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
