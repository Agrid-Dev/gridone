from apps.storage.storage_backend import (
    AppStorageBackend,
    RegistrationRequestStorageBackend,
)

POSTGRES_PREFIX = "postgresql"


async def build_registration_request_storage(
    url: str,
) -> RegistrationRequestStorageBackend:
    if url.startswith(POSTGRES_PREFIX):
        import asyncpg  # noqa: PLC0415

        from apps.storage.postgres import (  # noqa: PLC0415
            PostgresRegistrationRequestStorage,
            run_migrations,
        )

        run_migrations(url)
        pool = await asyncpg.create_pool(dsn=url, min_size=1, max_size=3)
        return PostgresRegistrationRequestStorage(pool)

    msg = "Apps package requires PostgreSQL storage"
    raise ValueError(msg)


async def build_apps_storages(
    url: str,
) -> tuple[RegistrationRequestStorageBackend, AppStorageBackend]:
    """Build both storage backends sharing a single connection pool."""
    if url.startswith(POSTGRES_PREFIX):
        import asyncpg  # noqa: PLC0415

        from apps.storage.postgres import (  # noqa: PLC0415
            PostgresAppStorage,
            PostgresRegistrationRequestStorage,
            run_migrations,
        )

        run_migrations(url)
        pool = await asyncpg.create_pool(dsn=url, min_size=1, max_size=3)
        return PostgresRegistrationRequestStorage(pool), PostgresAppStorage(pool)

    msg = "Apps package requires PostgreSQL storage"
    raise ValueError(msg)


__all__ = ["build_apps_storages", "build_registration_request_storage"]
