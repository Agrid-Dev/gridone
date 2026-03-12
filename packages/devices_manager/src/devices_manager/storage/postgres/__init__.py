import logging
from pathlib import Path

from .postgres_dm_storage import PostgresDevicesManagerStorage
from .postgres_storage import PostgresStorageBackend

logger = logging.getLogger(__name__)

MIGRATIONS_PATH = Path(__file__).parent / "migrations"


def run_migrations(database_url: str) -> None:
    """Apply pending yoyo migrations for the devices_manager package."""
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


__all__ = ["PostgresDevicesManagerStorage", "PostgresStorageBackend", "run_migrations"]
