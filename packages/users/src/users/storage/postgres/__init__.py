import json
import logging
from pathlib import Path

import asyncpg

from users.storage.postgres.postgres_roles_storage import PostgresRolesStorage
from users.storage.postgres.postgres_users_storage import PostgresUsersStorage

logger = logging.getLogger(__name__)

MIGRATIONS_PATH = Path(__file__).parent / "migrations"


def run_migrations(database_url: str) -> None:
    """Apply pending yoyo migrations for the users package."""
    from yoyo import get_backend, read_migrations  # noqa: PLC0415

    backend = get_backend(database_url)
    migrations = read_migrations(str(MIGRATIONS_PATH))
    with backend.lock():
        to_apply = backend.to_apply(migrations)
        if to_apply:
            logger.info(
                "Applying %d migration(s) from %s", len(to_apply), MIGRATIONS_PATH
            )
            backend.apply_migrations(to_apply)


async def _register_jsonb_codec(conn: asyncpg.Connection) -> None:
    """Make jsonb columns round-trip as Python values instead of JSON strings."""
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


async def create_pool(database_url: str) -> asyncpg.Pool:
    """One small pool shared by the users and roles backends."""
    return await asyncpg.create_pool(
        dsn=database_url, min_size=1, max_size=3, init=_register_jsonb_codec
    )


__all__ = [
    "PostgresRolesStorage",
    "PostgresUsersStorage",
    "create_pool",
    "run_migrations",
]
