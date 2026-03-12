from pathlib import Path

from users.storage.postgres.postgres_users_storage import PostgresUsersStorage

MIGRATIONS_PATH = Path(__file__).parent / "migrations"

__all__ = ["MIGRATIONS_PATH", "PostgresUsersStorage"]
