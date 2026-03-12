from assets.storage.storage_backend import AssetsStorageBackend

POSTGRES_PREFIX = "postgresql"


async def build_assets_storage(url: str) -> AssetsStorageBackend:
    if url.startswith(POSTGRES_PREFIX):
        import asyncpg  # noqa: PLC0415

        from assets.storage.postgres import (  # noqa: PLC0415
            PostgresAssetsStorage,
            run_migrations,
        )

        run_migrations(url)
        pool = await asyncpg.create_pool(dsn=url)
        return PostgresAssetsStorage(pool)

    msg = (
        "Assets package requires PostgreSQL. "
        f"Got storage URL: {url!r}. "
        "Set STORAGE_URL or DATABASE_URL to a postgresql:// connection string."
    )
    raise ValueError(msg)
