"""Database engine, session factory, and helpers."""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlmodel import Session, SQLModel, create_engine

from .config import get_settings


_settings = get_settings()

# `check_same_thread` is required for SQLite when used across the FastAPI worker thread pool.
_connect_args = {"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {}

engine = create_engine(
    _settings.database_url,
    echo=False,
    connect_args=_connect_args,
)


def init_db() -> None:
    """Import all models so they are registered with SQLModel metadata, then create tables."""
    # Imported here to avoid circular imports at module-load time.
    from .models import (  # noqa: F401  (registration side-effect)
        benchmark_run,
        dataset,
        example,
        judge_score,
        model_output,
        prompt_template,
    )

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency that yields a database session."""
    with Session(engine) as session:
        yield session


@contextmanager
def session_scope() -> Iterator[Session]:
    """Context manager for use inside background tasks/services."""
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
