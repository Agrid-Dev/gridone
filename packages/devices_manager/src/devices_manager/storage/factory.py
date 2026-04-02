from pathlib import Path

from .storage_backend import DevicesManagerStorage
from .yaml.core_file_storage import CoreFileStorage

POSTGRES_PREFIXES = "postgresql"


def make_storage(url: str) -> DevicesManagerStorage:
    return CoreFileStorage(Path(url))


async def build_storage(url: str) -> DevicesManagerStorage:
    if url.startswith(POSTGRES_PREFIXES):
        import json  # noqa: PLC0415

        import asyncpg  # noqa: PLC0415

        from .postgres import (  # noqa: PLC0415
            PostgresDevicesManagerStorage,
            run_migrations,
        )

        async def _init_connection(conn: asyncpg.Connection) -> None:
            await conn.set_type_codec(
                "jsonb",
                encoder=json.dumps,
                decoder=json.loads,
                schema="pg_catalog",
            )

        run_migrations(url)
        pool = await asyncpg.create_pool(
            dsn=url, min_size=1, max_size=3, init=_init_connection
        )
        return PostgresDevicesManagerStorage(pool)
    return make_storage(url)


__all__ = ["build_storage", "make_storage"]
