from pathlib import Path

from timeseries.storage.postgres.postgres_storage import PostgresStorage

MIGRATIONS_PATH = Path(__file__).parent / "migrations"

__all__ = ["MIGRATIONS_PATH", "PostgresStorage"]
