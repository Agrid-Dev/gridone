from pathlib import Path

import asyncpg

from users.storage.authorization_storage_backend import AuthorizationStorageBackend
from users.storage.storage_backend import UsersStorageBackend

POSTGRES_PREFIX = "postgresql"


async def _get_or_create_pool(
    url: str, pool: asyncpg.Pool | None = None
) -> asyncpg.Pool:
    if pool is not None:
        return pool
    return await asyncpg.create_pool(dsn=url)


async def build_users_storage(
    url: str, *, pool: asyncpg.Pool | None = None
) -> tuple[UsersStorageBackend, asyncpg.Pool | None]:
    """Build a users storage backend.

    Returns (storage, pool) where pool is the asyncpg pool if PostgreSQL,
    or None for YAML.  The pool can be passed to build_authorization_storage.
    """
    if url.startswith(POSTGRES_PREFIX):
        from users.storage.postgres.postgres_users_storage import (  # noqa: PLC0415
            PostgresUsersStorage,
        )

        pg_pool = await _get_or_create_pool(url, pool)
        storage = PostgresUsersStorage(pg_pool)
        await storage.ensure_schema()
        return storage, pg_pool

    from users.storage.yaml.yaml_users_storage import YamlUsersStorage  # noqa: PLC0415

    return YamlUsersStorage(Path(url) / "users"), None


async def build_authorization_storage(
    url: str, *, pool: asyncpg.Pool | None = None
) -> AuthorizationStorageBackend:
    """Build an authorization storage backend.

    Accepts an optional asyncpg pool to share with users storage.
    """
    if url.startswith(POSTGRES_PREFIX):
        from users.storage.postgres.postgres_authorization_storage import (  # noqa: PLC0415
            PostgresAuthorizationStorage,
        )

        pg_pool = await _get_or_create_pool(url, pool)
        storage = PostgresAuthorizationStorage(pg_pool)
        await storage.ensure_schema()
        return storage

    from users.storage.yaml.yaml_authorization_storage import (  # noqa: PLC0415
        YamlAuthorizationStorage,
    )

    return YamlAuthorizationStorage(Path(url))


__all__ = ["build_authorization_storage", "build_users_storage"]
