"""Yoyo migrations runner for Gridone."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger(__name__)


def run_migrations(database_url: str, migrations_path: str | Path) -> None:
    """Apply pending yoyo migrations from *migrations_path*."""
    from yoyo import get_backend, read_migrations  # noqa: PLC0415

    backend = get_backend(database_url)
    migrations = read_migrations(str(migrations_path))

    with backend.lock():
        to_apply = backend.to_apply(migrations)
        if to_apply:
            logger.info(
                "Applying %d migration(s) from %s",
                len(to_apply),
                migrations_path,
            )
            backend.apply_migrations(to_apply)
