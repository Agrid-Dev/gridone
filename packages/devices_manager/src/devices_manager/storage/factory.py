from pathlib import Path

import asyncpg

from .postgres.postgres_dm_storage import PostgresDevicesManagerStorage
from .storage_backend import DevicesManagerStorage
from .yaml.core_file_storage import CoreFileStorage

POSTGRES_PREFIXES = "postgresql"


def make_storage(url: str) -> DevicesManagerStorage:
    return CoreFileStorage(Path(url))


async def build_storage(url: str) -> DevicesManagerStorage:
    if url.startswith(POSTGRES_PREFIXES):
        pool = await asyncpg.create_pool(dsn=url)
        storage = PostgresDevicesManagerStorage(pool)
        await storage.ensure_schema()
        return storage
    return make_storage(url)


__all__ = ["build_storage", "make_storage"]
