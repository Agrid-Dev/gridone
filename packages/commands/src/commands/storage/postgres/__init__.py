import json
import logging
from pathlib import Path

import asyncpg
from yoyo import get_backend, read_migrations

from commands.storage.postgres.postgres_storage import PostgresCommandsStorage

logger = logging.getLogger(__name__)

MIGRATIONS_PATH = Path(__file__).parent / "migrations"


def run_migrations(database_url: str) -> None:
    """Apply pending yoyo migrations for the commands package."""
    backend = get_backend(database_url)
    migrations = read_migrations(str(MIGRATIONS_PATH))
    with backend.lock():
        to_apply = backend.to_apply(migrations)
        if to_apply:
            logger.info(
                "Applying %d migration(s) from %s", len(to_apply), MIGRATIONS_PATH
            )
            backend.apply_migrations(to_apply)


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Register the jsonb codec on each pooled connection so ``target`` /
    ``write`` round-trip as dicts instead of JSON strings."""
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


async def build_postgres_storage(url: str) -> PostgresCommandsStorage:
    """Apply migrations and open an asyncpg pool configured for the commands
    package. Called only when the composition root picks a postgres URL —
    the memory backend never triggers an asyncpg import."""
    run_migrations(url)
    pool = await asyncpg.create_pool(url, min_size=1, max_size=3, init=_init_connection)
    return PostgresCommandsStorage(pool)


__all__ = ["PostgresCommandsStorage", "build_postgres_storage", "run_migrations"]
