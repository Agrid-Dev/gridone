import asyncpg

from assets.storage.postgres.postgres_assets_storage import PostgresAssetsStorage
from assets.storage.storage_backend import AssetsStorageBackend

POSTGRES_PREFIX = "postgresql"


async def build_assets_storage(url: str) -> AssetsStorageBackend:
    if url.startswith(POSTGRES_PREFIX):
        pool = await asyncpg.create_pool(dsn=url)
        storage = PostgresAssetsStorage(pool)
        await storage.ensure_schema()
        return storage

    msg = (
        "Assets package requires PostgreSQL. "
        f"Got storage URL: {url!r}. "
        "Set STORAGE_URL or DATABASE_URL to a postgresql:// connection string."
    )
    raise ValueError(msg)
