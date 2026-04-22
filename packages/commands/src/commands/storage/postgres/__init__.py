import json
import logging
from pathlib import Path

import asyncpg
from yoyo import get_backend, read_migrations

from commands.storage.postgres.postgres_storage import PostgresCommandsStorage

logger = logging.getLogger(__name__)

MIGRATIONS_PATH = Path(__file__).parent / "migrations"


# Idempotent cross-service fixup. Kept outside yoyo because yoyo's one-shot
# semantics don't help us here: on a fresh DB where the commands package's
# migrations run before the timeseries package has had a chance to create
# ``ts_data_points``, 0005's ``DO`` block is a no-op, and yoyo then marks
# it as applied — it will never re-run when the timeseries package
# subsequently creates ``ts_data_points`` with the stale FK. Running this
# SQL on every ``run_migrations`` call guarantees the FK eventually
# reaches ``unit_commands`` regardless of package-load order.
_POST_MIGRATION_SQL = """
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'ts_data_points'
    ) THEN
        ALTER TABLE ts_data_points
            DROP CONSTRAINT IF EXISTS ts_data_points_command_id_fkey;
        ALTER TABLE ts_data_points
            ADD CONSTRAINT ts_data_points_command_id_fkey
            FOREIGN KEY (command_id) REFERENCES unit_commands(id);
    END IF;

    DROP TABLE IF EXISTS ts_device_commands;
END $$;
"""


def run_migrations(database_url: str) -> None:
    """Apply pending yoyo migrations and ensure cross-service constraints
    are in their current expected state.

    The post-migration fixup is idempotent and always runs — see the
    comment on :data:`_POST_MIGRATION_SQL` for why it can't live as a
    regular yoyo migration.
    """
    backend = get_backend(database_url)
    migrations = read_migrations(str(MIGRATIONS_PATH))
    with backend.lock():
        to_apply = backend.to_apply(migrations)
        if to_apply:
            logger.info(
                "Applying %d migration(s) from %s", len(to_apply), MIGRATIONS_PATH
            )
            backend.apply_migrations(to_apply)
        with backend.connection.cursor() as cur:
            cur.execute(_POST_MIGRATION_SQL)
        backend.connection.commit()


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
