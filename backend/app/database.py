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
        benchmark_score,
        dataset,
        example,
        judge_score,
        model_output,
        prompt_template,
    )

    SQLModel.metadata.create_all(engine)
    _run_lightweight_migrations()


def _run_lightweight_migrations() -> None:
    """Add new nullable columns to existing tables.

    `SQLModel.metadata.create_all` only creates missing tables — it does not alter
    existing ones. For the small number of columns we add over time, a `PRAGMA
    table_info` + `ALTER TABLE` approach keeps existing SQLite databases working.
    """
    if not _settings.database_url.startswith("sqlite"):
        return

    additions = {
        "benchmark_runs": [
            ("current_phase", "TEXT"),
            ("current_activity", "TEXT"),
            ("export_path", "TEXT"),
            ("judge_provider", "TEXT DEFAULT 'ollama'"),
            ("judge_criteria_json", "TEXT"),
            ("judge_system_prompt", "TEXT"),
            ("judge_user_template", "TEXT"),
            ("evaluation_mode", "TEXT DEFAULT 'judge'"),
        ],
    }

    with engine.connect() as conn:
        for table, columns in additions.items():
            try:
                existing_rows = conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
            except Exception:
                continue
            existing = {row[1] for row in existing_rows}
            for name, column_type in columns:
                if name in existing:
                    continue
                try:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {column_type}")
                except Exception:
                    pass
        conn.commit()


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
