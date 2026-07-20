from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

import asyncpg
from yoyo import get_backend, read_migrations

from dashboards.storage.postgres.postgres_storage import PostgresDashboardsStorage

if TYPE_CHECKING:
    from dashboards.widgets.registry import WidgetRegistry

logger = logging.getLogger(__name__)

MIGRATIONS_PATH = Path(__file__).parent / "migrations"


def run_migrations(database_url: str) -> None:
    """Apply pending yoyo migrations for the dashboards package."""
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
    """Register the jsonb codec on each pooled connection so ``widgets``
    round-trips as Python lists/dicts instead of JSON strings."""
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


async def build_postgres_storage(
    url: str, registry: WidgetRegistry
) -> PostgresDashboardsStorage:
    """Apply migrations and open an asyncpg pool for the dashboards package.

    Called only when the composition root picks a postgres URL — the memory
    backend never triggers an asyncpg import.
    """
    run_migrations(url)
    pool = await asyncpg.create_pool(url, min_size=1, max_size=3, init=_init_connection)
    return PostgresDashboardsStorage(pool, registry)


__all__ = ["PostgresDashboardsStorage", "build_postgres_storage", "run_migrations"]
