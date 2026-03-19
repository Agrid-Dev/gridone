from apps.storage.storage_backend import RegistrationRequestStorageBackend

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


__all__ = ["build_registration_request_storage"]
