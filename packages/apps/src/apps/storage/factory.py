from dataclasses import dataclass

from apps.storage.memory import MemoryAppStorage, MemoryRegistrationStorage
from apps.storage.storage_backend import (
    AppStorageBackend,
    RegistrationRequestStorageBackend,
)
from models.errors import StorageConnectionError, UnsupportedStorageError

_POSTGRES_PREFIX = "postgresql"


@dataclass
class AppsStorages:
    """Bundle of registration and apps storage backends.

    For postgres, both share a single connection pool — `close()` invokes
    `close()` on each backend. asyncpg's `Pool.close()` is idempotent, so
    closing twice is safe.
    """

    registration: RegistrationRequestStorageBackend
    apps: AppStorageBackend

    async def close(self) -> None:
        await self.apps.close()
        await self.registration.close()


async def build_apps_storages(url: str | None) -> AppsStorages:
    """Build the registration and apps storage backends from a connection URL.

    `url=None` selects the in-memory backends. A `postgresql://` URL builds
    postgres-backed storages sharing a single pool.

    Raises:
        UnsupportedStorageError: the URL scheme is not recognised.
        StorageConnectionError: the postgres backend cannot be reached or
            initialized (migration failure, connection refused, ...).
    """
    if url is None:
        return AppsStorages(
            registration=MemoryRegistrationStorage(),
            apps=MemoryAppStorage(),
        )

    if url.startswith(_POSTGRES_PREFIX):
        from apps.storage.postgres import build  # noqa: PLC0415

        try:
            return await build(url)
        except Exception as e:
            msg = "Failed to initialize apps postgres backend"
            raise StorageConnectionError(msg) from e

    msg = f"Unsupported apps storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)


__all__ = ["AppsStorages", "build_apps_storages"]
