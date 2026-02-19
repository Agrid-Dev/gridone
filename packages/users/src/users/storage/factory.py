from pathlib import Path

from users.storage.storage_backend import UsersStorageBackend

POSTGRES_PREFIX = "postgresql"


async def build_users_storage(url: str) -> UsersStorageBackend:
    if url.startswith(POSTGRES_PREFIX):
        import asyncpg

        from users.storage.postgres.postgres_users_storage import PostgresUsersStorage

        pool = await asyncpg.create_pool(dsn=url)
        storage = PostgresUsersStorage(pool)
        await storage.ensure_schema()
        return storage

    from users.storage.yaml.yaml_users_storage import YamlUsersStorage

    return YamlUsersStorage(Path(url) / "users")


__all__ = ["build_users_storage"]
