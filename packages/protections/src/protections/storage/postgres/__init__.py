from pathlib import Path

import asyncpg
from yoyo import get_backend, read_migrations

from .postgres_storage import PostgresStorage

MIGRATIONS_PATH = Path(__file__).parent / "migrations"


def run_migrations(url: str) -> None:
    backend = get_backend(url)
    with backend.lock():
        backend.apply_migrations(
            backend.to_apply(read_migrations(str(MIGRATIONS_PATH)))
        )


async def build_postgres_storage(url: str) -> PostgresStorage:
    run_migrations(url)
    return PostgresStorage(await asyncpg.create_pool(url, min_size=1, max_size=3))
