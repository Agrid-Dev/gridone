import logging
from pathlib import Path

from assets.storage.postgres.postgres_assets_storage import PostgresAssetsStorage

logger = logging.getLogger(__name__)

MIGRATIONS_PATH = Path(__file__).parent / "migrations"


def run_migrations(database_url: str) -> None:
    """Apply pending yoyo migrations for the assets package."""
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


__all__ = ["PostgresAssetsStorage", "run_migrations"]
