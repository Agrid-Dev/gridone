import asyncpg

from notifications.storage.postgres import PostgresNotificationsStorage, run_migrations
from notifications.storage.protocol import NotificationsStorageBackend

_POSTGRES_PREFIX = "postgresql"


async def build_notifications_storage(url: str) -> NotificationsStorageBackend:
    if url.startswith(_POSTGRES_PREFIX):
        run_migrations(url)
        pool = await asyncpg.create_pool(dsn=url, min_size=1, max_size=3)
        return PostgresNotificationsStorage(pool)

    msg = f"Unsupported storage URL scheme: {url!r}"
    raise ValueError(msg)
