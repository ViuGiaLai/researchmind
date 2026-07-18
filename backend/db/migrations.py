from collections.abc import Callable

from loguru import logger
from sqlalchemy import inspect, text

from db.models import SchemaMigration, Workspace, generate_uuid

DEFAULT_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001"


def _seed_default_workspace(connection) -> None:
    existing = connection.execute(
        text("SELECT id FROM workspaces WHERE is_default = 1 LIMIT 1")
    ).first()
    if existing:
        return
    connection.execute(
        text(
            "INSERT INTO workspaces (id, name, is_default, created_at, updated_at) "
            "VALUES (:id, :name, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ),
        {"id": DEFAULT_WORKSPACE_ID, "name": "My Research"},
    )


MIGRATIONS: list[tuple[int, str, Callable]] = [
    (1, "seed_default_workspace", _seed_default_workspace),
]


def run_migrations(engine) -> None:
    """Apply idempotent, versioned data migrations in a transaction."""
    if not inspect(engine).has_table(SchemaMigration.__tablename__):
        SchemaMigration.__table__.create(engine, checkfirst=True)

    with engine.begin() as connection:
        applied = {
            row[0]
            for row in connection.execute(text("SELECT version FROM schema_migrations")).all()
        }
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
