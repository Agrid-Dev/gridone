from models.errors import StorageConnectionError, UnsupportedStorageError
from users.storage.memory import MemoryUsersStorage
from users.storage.storage_backend import UsersStorageBackend

POSTGRES_PREFIX = "postgresql"


async def build_users_storage(url: str | None) -> UsersStorageBackend:
    if url is None:
        return MemoryUsersStorage()

    if url.startswith(POSTGRES_PREFIX):
        import asyncpg  # noqa: PLC0415

        from users.storage.postgres import (  # noqa: PLC0415
            PostgresUsersStorage,
            run_migrations,
        )

        try:
            run_migrations(url)
            pool = await asyncpg.create_pool(dsn=url, min_size=1, max_size=3)
        except Exception as e:
            msg = f"Failed to initialize users postgres backend at {url!r}"
            raise StorageConnectionError(msg) from e
        return PostgresUsersStorage(pool)

    msg = f"Unsupported users storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)


__all__ = ["build_users_storage"]
