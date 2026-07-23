from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import QueuePool


def get_engine(db_path: Path):
    """Create the shared SQLite engine used by the desktop backend.

    A small bounded pool avoids reopening SQLite for every query while WAL and
    busy_timeout keep concurrent readers/import jobs from failing immediately
    with ``database is locked``.
    """
    db_path.parent.mkdir(parents=True, exist_ok=True)

    engine = create_engine(
        f"sqlite:///{db_path}",
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=5,
        pool_timeout=30,
        pool_recycle=1800,
        connect_args={
            "check_same_thread": False,
            "timeout": 5.0,
        },
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=-64000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    return engine


def get_session(engine) -> Session:
    """Create an isolated unit-of-work without rebuilding a session factory."""
    return Session(bind=engine, expire_on_commit=False)
