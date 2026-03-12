from pathlib import Path

from assets.storage.postgres.postgres_assets_storage import PostgresAssetsStorage

MIGRATIONS_PATH = Path(__file__).parent / "migrations"

__all__ = ["MIGRATIONS_PATH", "PostgresAssetsStorage"]
