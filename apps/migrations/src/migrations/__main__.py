"""CLI entrypoint: python -m migrations apply."""

from __future__ import annotations

import argparse
import logging
import os
import sys

from assets.storage.postgres import MIGRATIONS_PATH as ASSETS_MIGRATIONS
from devices_manager.storage.postgres import MIGRATIONS_PATH as DM_MIGRATIONS
from timeseries.storage.postgres import MIGRATIONS_PATH as TS_MIGRATIONS
from users.storage.postgres import MIGRATIONS_PATH as USERS_MIGRATIONS

from migrations import run_migrations

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

ALL_MIGRATIONS = [
    ("users", USERS_MIGRATIONS),
    ("devices_manager", DM_MIGRATIONS),
    ("timeseries", TS_MIGRATIONS),
    ("assets", ASSETS_MIGRATIONS),
]


def _get_database_url() -> str:
    url = os.environ.get("STORAGE_URL") or os.environ.get("DATABASE_URL") or ""
    if not url.startswith("postgresql"):
        logger.error(
            "Set STORAGE_URL or DATABASE_URL to a postgresql:// connection string."
        )
        sys.exit(1)
    return url


def main() -> None:
    parser = argparse.ArgumentParser(prog="migrations")
    parser.add_argument("command", choices=["apply"])
    parser.add_argument(
        "--database-url",
        default=None,
        help="PostgreSQL URL (default: STORAGE_URL or DATABASE_URL env var)",
    )
    args = parser.parse_args()

    database_url: str = args.database_url or _get_database_url()

    if args.command == "apply":
        for name, path in ALL_MIGRATIONS:
            logger.info("Running migrations for %s …", name)
            run_migrations(database_url, path)
        logger.info("All migrations applied.")


if __name__ == "__main__":
    main()
