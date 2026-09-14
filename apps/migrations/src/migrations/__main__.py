"""CLI entrypoint: python -m migrations apply."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from assets.storage.postgres import run_migrations as run_assets_migrations
from device_views.storage.postgres import run_migrations as run_views_migrations
from devices_manager.storage.postgres import run_migrations as run_dm_migrations
from migrations.tag_preflight import audit_snapshot
from timeseries.storage.postgres import run_migrations as run_ts_migrations
from users.storage.postgres import run_migrations as run_users_migrations

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

ALL_MIGRATIONS = [
    ("users", run_users_migrations),
    ("devices_manager", run_dm_migrations),
    ("device_views", run_views_migrations),
    ("timeseries", run_ts_migrations),
    ("assets", run_assets_migrations),
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
    parser.add_argument("command", choices=["apply", "preflight-tags"])
    parser.add_argument(
        "--database-url",
        default=None,
        help="PostgreSQL URL (default: STORAGE_URL or DATABASE_URL env var)",
    )
    parser.add_argument(
        "--snapshot", type=Path, help="JSON export for read-only tag preflight"
    )
    args = parser.parse_args()
    if args.command == "preflight-tags":
        if args.snapshot is None:
            parser.error("preflight-tags requires --snapshot")
        findings = audit_snapshot(json.loads(args.snapshot.read_text(encoding="utf-8")))
        for finding in findings:
            logger.error("%s", finding)
        if findings:
            sys.exit(1)
        logger.info("Tag and saved-target preflight passed.")
        return

    database_url: str = args.database_url or _get_database_url()

    if args.command == "apply":
        for name, run_fn in ALL_MIGRATIONS:
            logger.info("Running migrations for %s …", name)
            run_fn(database_url)
        logger.info("All migrations applied.")


if __name__ == "__main__":
    main()
