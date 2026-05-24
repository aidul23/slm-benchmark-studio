"""FastAPI application entry point."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import init_db
from .routers import (
    benchmarks,
    datasets,
    insights,
    judge,
    ollama_models,
    prompts,
    providers,
    runs,
)


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
    app.include_router(providers.router)
    app.include_router(judge.router)
    app.include_router(datasets.router)
    app.include_router(prompts.router)
    app.include_router(runs.router)
    app.include_router(insights.router)
    app.include_router(benchmarks.router)

    return app


def _seed_default_prompts() -> None:
    """Ensure helpful prompt templates exist (generation default + MCQ benchmarks)."""
    from sqlmodel import select

    from .database import session_scope
    from .models.prompt_template import PromptTemplate

    defaults = [
        dict(
            name="Default generation prompt",
            system_prompt="You are a helpful assistant. Follow the task exactly and answer clearly.",
            template="{{input}}",
            notes="Created automatically on first launch. Customize as needed.",
        ),
        dict(
            name="MCQ benchmark (MMLU / HellaSwag)",
            system_prompt=(
                "You are taking a multiple-choice exam. Read the question and the lettered "
                "options carefully. Respond with ONLY the single letter (A, B, C, or D) of "
                "the best answer. Do not add any explanation, punctuation, or other text."
            ),
            template="{{input}}",
            notes=(
                "Designed for MMLU and HellaSwag imports. The example body already contains "
                "the lettered choices and the instruction line; this template just forwards "
                "it so the system prompt can enforce a single-letter answer."
            ),
        ),
    ]

    with session_scope() as session:
        existing_names = {
            row.name
            for row in session.exec(select(PromptTemplate)).all()
        }
        for spec in defaults:
            if spec["name"] in existing_names:
                continue
            session.add(
                PromptTemplate(
                    name=spec["name"],
                    system_prompt=spec["system_prompt"],
                    template=spec["template"],
                    version=1,
                    notes=spec["notes"],
                )
            )


app = create_app()
