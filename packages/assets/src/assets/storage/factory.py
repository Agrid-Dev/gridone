from assets.storage.building_models_backend import BuildingModelsStorageBackend
from assets.storage.memory import MemoryAssetsStorage
from assets.storage.memory_building_models import MemoryBuildingModelsStorage
from assets.storage.storage_backend import AssetsStorageBackend
from models.errors import StorageConnectionError, UnsupportedStorageError

POSTGRES_PREFIX = "postgresql"


async def build_assets_storage(url: str | None) -> AssetsStorageBackend:
    if url is None:
        return MemoryAssetsStorage()

    if url.startswith(POSTGRES_PREFIX):
        from assets.storage.postgres import (  # noqa: PLC0415
            PostgresAssetsStorage,
        )

        pool = await _connect(url)
        return PostgresAssetsStorage(pool)

    msg = f"Unsupported assets storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)


async def build_building_models_storage(
    url: str | None,
) -> BuildingModelsStorageBackend:
    if url is None:
        return MemoryBuildingModelsStorage()

    if url.startswith(POSTGRES_PREFIX):
        from assets.storage.postgres import (  # noqa: PLC0415
            PostgresBuildingModelsStorage,
        )

        pool = await _connect(url)
        return PostgresBuildingModelsStorage(pool)

    msg = f"Unsupported building models storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)


async def _connect(url: str):  # noqa: ANN202 — asyncpg.Pool, imported lazily
    """Run the package migrations and open a pool, as one failure domain.

    Both backends live in the assets schema and share one migration chain;
    yoyo takes a lock and skips what is already applied, so whichever service
    starts first does the work and the other is a no-op.
    """
    import asyncpg  # noqa: PLC0415

    from assets.storage.postgres import run_migrations  # noqa: PLC0415

    try:
        run_migrations(url)
        return await asyncpg.create_pool(dsn=url, min_size=1, max_size=3)
    except Exception as e:
        msg = f"Failed to initialize assets postgres backend at {url!r}"
        raise StorageConnectionError(msg) from e
