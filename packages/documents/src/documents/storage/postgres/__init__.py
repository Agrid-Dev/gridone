import asyncio
from pathlib import Path

import asyncpg
from yoyo import get_backend, read_migrations

from documents.storage.postgres.storage import PostgresStorage


def run_migrations(database_url: str) -> None:
    backend = get_backend(database_url)
    migrations = read_migrations(str(Path(__file__).parent / "migrations"))
    with backend.lock():
        backend.apply_migrations(backend.to_apply(migrations))


async def build_postgres_storage(url: str) -> PostgresStorage:
    await asyncio.to_thread(run_migrations, url)
    pool = await asyncpg.create_pool(url, min_size=1, max_size=3)
    return PostgresStorage(pool)
