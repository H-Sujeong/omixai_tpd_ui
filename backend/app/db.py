"""SQLAlchemy engine / session / Base for the local SQLite app database.

Holds accounts, server-side sessions, and plate ownership metadata (the data
files themselves stay on disk; the DB only points at them). Single-file SQLite
at ``settings.db_path`` (var/omixai.db).
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


_settings = get_settings()
# check_same_thread=False so the FastAPI threadpool can share the engine.
engine = create_engine(
    f"sqlite:///{_settings.db_path}",
    connect_args={"check_same_thread": False},
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a DB session (closed after the request)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables if they don't exist (called on startup)."""
    from . import models  # noqa: F401  (register mappers)

    Base.metadata.create_all(engine)
