from dataclasses import dataclass

from models.errors import StorageConnectionError, UnsupportedStorageError
from users.storage.memory_roles import MemoryRolesStorage
from users.storage.memory_users import MemoryUsersStorage
from users.storage.roles_backend import RolesStorageBackend
from users.storage.users_backend import UsersStorageBackend

POSTGRES_PREFIX = "postgresql"


@dataclass(frozen=True)
class UsersStorages:
    """The two backends of the users service, one per table.

    They share one connection; ``close`` releases it once for both.
    """

    users: UsersStorageBackend
    roles: RolesStorageBackend

    async def close(self) -> None:
        await self.users.close()


async def build_users_storage(url: str | None) -> UsersStorages:
    if url is None:
        return UsersStorages(users=MemoryUsersStorage(), roles=MemoryRolesStorage())

    if url.startswith(POSTGRES_PREFIX):
        from users.storage.postgres import (  # noqa: PLC0415
            PostgresRolesStorage,
            PostgresUsersStorage,
            create_pool,
            run_migrations,
        )

        try:
            run_migrations(url)
            pool = await create_pool(url)
        except Exception as e:
            msg = f"Failed to initialize users postgres backend at {url!r}"
            raise StorageConnectionError(msg) from e
        return UsersStorages(
            users=PostgresUsersStorage(pool), roles=PostgresRolesStorage(pool)
        )

    msg = f"Unsupported users storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)


__all__ = ["UsersStorages", "build_users_storage"]
