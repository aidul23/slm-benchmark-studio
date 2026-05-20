"""FastAPI application entry point."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import init_db
from .routers import datasets, insights, ollama_models, prompts, runs


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _seed_default_prompts()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="SLM Benchmark Studio",
        description=(
            "Local-first benchmarking platform for small language models served via Ollama. "
            "Implements the Data → Models → Judge → Insights → Refinement loop."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    app.include_router(ollama_models.router)
    app.include_router(datasets.router)
    app.include_router(prompts.router)
    app.include_router(runs.router)
    app.include_router(insights.router)

    return app


def _seed_default_prompts() -> None:
    """Insert a sensible default generation template the first time the DB is created."""
    from sqlmodel import select

    from .database import session_scope
    from .models.prompt_template import PromptTemplate

    with session_scope() as session:
        existing = session.exec(select(PromptTemplate)).first()
        if existing is not None:
            return
        session.add(
            PromptTemplate(
                name="Default generation prompt",
                system_prompt="You are a helpful assistant. Follow the task exactly and answer clearly.",
                template="{{input}}",
                version=1,
                notes="Created automatically on first launch. Customize as needed.",
            )
        )


app = create_app()
