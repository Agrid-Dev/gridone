import logging
from pathlib import Path

import asyncpg

from apps.storage.postgres.postgres_app_storage import PostgresAppStorage
from apps.storage.postgres.postgres_registration_storage import (
    PostgresRegistrationRequestStorage,
)
from apps.storage.storage_backend import (
    AppStorageBackend,
    RegistrationRequestStorageBackend,
)

logger = logging.getLogger(__name__)

MIGRATIONS_PATH = Path(__file__).parent / "migrations"


def run_migrations(database_url: str) -> None:
    """Apply pending yoyo migrations for the apps package."""
    from yoyo import get_backend, read_migrations  # noqa: PLC0415

    backend = get_backend(database_url)
    migrations = read_migrations(str(MIGRATIONS_PATH))
    with backend.lock():
        to_apply = backend.to_apply(migrations)
        if to_apply:
            logger.info(
                "Applying %d migration(s) from %s", len(to_apply), MIGRATIONS_PATH
            )
            backend.apply_migrations(to_apply)


async def build(
    url: str,
) -> tuple[RegistrationRequestStorageBackend, AppStorageBackend]:
    """Build both postgres storage backends sharing a single connection pool."""
    run_migrations(url)
    pool = await asyncpg.create_pool(dsn=url, min_size=1, max_size=3)
    return PostgresRegistrationRequestStorage(pool), PostgresAppStorage(pool)


__all__ = [
    "PostgresAppStorage",
    "PostgresRegistrationRequestStorage",
    "build",
    "run_migrations",
]
