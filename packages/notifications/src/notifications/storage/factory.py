import asyncpg

from models.errors import StorageConnectionError, UnsupportedStorageError
from notifications.storage.memory import MemoryNotificationsStorage
from notifications.storage.postgres import PostgresNotificationsStorage, run_migrations
from notifications.storage.protocol import NotificationsStorageBackend

_POSTGRES_PREFIX = "postgresql"


async def build_notifications_storage(
    url: str | None,
) -> NotificationsStorageBackend:
    if url is None:
        return MemoryNotificationsStorage()

    if url.startswith(_POSTGRES_PREFIX):
        try:
            run_migrations(url)
            pool = await asyncpg.create_pool(dsn=url, min_size=1, max_size=3)
        except Exception as e:
            msg = "Failed to initialize notifications storage backend"
            raise StorageConnectionError(msg) from e
        return PostgresNotificationsStorage(pool)

    msg = f"Unsupported storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)
