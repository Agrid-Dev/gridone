import logging
from pathlib import Path

from yoyo import get_backend, read_migrations

from notifications.storage.postgres.postgres_notifications_storage import (
    PostgresNotificationsStorage as PostgresNotificationsStorage,
)

logger = logging.getLogger(__name__)

MIGRATIONS_PATH = Path(__file__).parent / "migrations"


def run_migrations(database_url: str) -> None:
    """Apply pending yoyo migrations for the notifications package."""
    backend = get_backend(database_url)
    migrations = read_migrations(str(MIGRATIONS_PATH))
    with backend.lock():
        to_apply = backend.to_apply(migrations)
        if to_apply:
            logger.info(
                "Applying %d migration(s) from %s", len(to_apply), MIGRATIONS_PATH
            )
            backend.apply_migrations(to_apply)
