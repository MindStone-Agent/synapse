"""SQLAlchemy engine + session factory.

Single global engine per process. Session is scoped per-request via
FastAPI dependency injection (`get_session`). SQLite gets WAL mode +
foreign-key enforcement on connect.
"""

from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from api.config import get_settings


def _build_engine(database_url: str) -> Engine:
    connect_args: dict[str, object] = {}
    if database_url.startswith("sqlite"):
        # check_same_thread=False so FastAPI's threadpool can hand a
        # connection to whichever request thread needs it. Safe because
        # the session is scoped per-request.
        connect_args["check_same_thread"] = False

    engine = create_engine(
        database_url,
        connect_args=connect_args,
        future=True,
    )

    if database_url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):  # type: ignore[no-untyped-def]
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys = ON")
            cursor.execute("PRAGMA journal_mode = WAL")
            cursor.execute("PRAGMA synchronous = NORMAL")
            cursor.close()

    return engine


_settings = get_settings()
engine: Engine = _build_engine(_settings.database_url)
SessionFactory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """FastAPI dependency. Yields a Session, closes it after the request."""
    session = SessionFactory()
    try:
        yield session
    finally:
        session.close()
