from pathlib import Path

from users.storage.storage_backend import UsersStorageBackend

POSTGRES_PREFIX = "postgresql"


async def build_users_storage(url: str) -> UsersStorageBackend:
    if url.startswith(POSTGRES_PREFIX):
        import asyncpg  # noqa: PLC0415

        from users.storage.postgres import (  # noqa: PLC0415
            PostgresUsersStorage,
            run_migrations,
        )

        run_migrations(url)
        pool = await asyncpg.create_pool(dsn=url, min_size=1, max_size=3)
        return PostgresUsersStorage(pool)

    from users.storage.yaml.yaml_users_storage import YamlUsersStorage  # noqa: PLC0415

    return YamlUsersStorage(Path(url) / "users")


__all__ = ["build_users_storage"]
