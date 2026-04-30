from assets.storage.memory import MemoryAssetsStorage
from assets.storage.storage_backend import AssetsStorageBackend
from models.errors import StorageConnectionError, UnsupportedStorageError

POSTGRES_PREFIX = "postgresql"


async def build_assets_storage(url: str | None) -> AssetsStorageBackend:
    if url is None:
        return MemoryAssetsStorage()

    if url.startswith(POSTGRES_PREFIX):
        import asyncpg  # noqa: PLC0415

        from assets.storage.postgres import (  # noqa: PLC0415
            PostgresAssetsStorage,
            run_migrations,
        )

        try:
            run_migrations(url)
            pool = await asyncpg.create_pool(dsn=url, min_size=1, max_size=3)
        except Exception as e:
            msg = f"Failed to initialize assets postgres backend at {url!r}"
            raise StorageConnectionError(msg) from e
        return PostgresAssetsStorage(pool)

    msg = f"Unsupported assets storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)
