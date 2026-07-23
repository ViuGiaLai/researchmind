from collections.abc import Callable

from loguru import logger
from sqlalchemy import inspect, text

from db.models import SchemaMigration

DEFAULT_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001"


def _seed_default_workspace(connection) -> None:
    existing = connection.execute(text("SELECT id FROM workspaces WHERE is_default = 1 LIMIT 1")).first()
    if existing:
        return
    connection.execute(
        text(
            "INSERT INTO workspaces (id, name, is_default, created_at, updated_at) "
            "VALUES (:id, :name, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ),
        {"id": DEFAULT_WORKSPACE_ID, "name": "My Research"},
    )


def _add_hot_path_indexes(connection) -> None:
    """Index filters and sort keys used on every dashboard/chat request."""
    statements = (
        "CREATE INDEX IF NOT EXISTS ix_papers_status ON papers(status)",
        "CREATE INDEX IF NOT EXISTS ix_papers_status_read ON papers(status, read_status)",
        "CREATE INDEX IF NOT EXISTS ix_papers_created_at ON papers(created_at)",
        "CREATE INDEX IF NOT EXISTS ix_import_jobs_status_created ON import_jobs(status, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_chat_history_role_created ON chat_history(role, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_chat_history_session_created ON chat_history(session_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_collection_papers_paper ON collection_papers(paper_id)",
    )
    for statement in statements:
        connection.execute(text(statement))


def _add_chat_history_created_index(connection) -> None:
    """Accelerate daily usage windows that do not filter by role or session."""
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_chat_history_created_at ON chat_history(created_at)"))


MIGRATIONS: list[tuple[int, str, Callable]] = [
    (1, "seed_default_workspace", _seed_default_workspace),
    (2, "add_hot_path_indexes", _add_hot_path_indexes),
    (3, "add_chat_history_created_index", _add_chat_history_created_index),
]


def run_migrations(engine) -> None:
    """Apply idempotent, versioned migrations in a single transaction."""
    if not inspect(engine).has_table(SchemaMigration.__tablename__):
        SchemaMigration.__table__.create(engine, checkfirst=True)

    with engine.begin() as connection:
        applied = {row[0] for row in connection.execute(text("SELECT version FROM schema_migrations")).all()}
        for version, name, migration in MIGRATIONS:
            if version in applied:
                continue
            migration(connection)
            connection.execute(
                text(
                    "INSERT INTO schema_migrations (version, name, applied_at) "
                    "VALUES (:version, :name, CURRENT_TIMESTAMP)"
                ),
                {"version": version, "name": name},
            )
            logger.info(f"Database migration {version} applied: {name}")
