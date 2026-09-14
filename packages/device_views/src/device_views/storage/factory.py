from device_views.storage.memory import MemoryViewStorage
from device_views.storage.protocol import ViewStorage
from models.errors import StorageConnectionError, UnsupportedStorageError


async def build_storage(url: str | None) -> ViewStorage:
    if url is None:
        return MemoryViewStorage()
    if url.startswith(("postgresql://", "postgresql+asyncpg://")):
        from device_views.storage.postgres import (  # noqa: PLC0415 -- optional backend
            build_postgres_storage,
        )

        try:
            return await build_postgres_storage(
                url.replace("postgresql+asyncpg://", "postgresql://", 1)
            )
        except Exception as exc:
            msg = "Failed to initialize device views storage"
            raise StorageConnectionError(msg) from exc
    msg = "Unsupported device views storage URL scheme"
    raise UnsupportedStorageError(msg)
