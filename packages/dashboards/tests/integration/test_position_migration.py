"""Upgrading a deployment keeps its dashboards in creation order."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest
from dashboards.service import DashboardsService
from dashboards.storage.postgres import MIGRATIONS_PATH
from yoyo import get_backend, read_migrations

from models.ids import gen_id

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


async def test_existing_dashboards_keep_creation_order():
    assert POSTGRES_URL is not None
    admin = await asyncpg.connect(POSTGRES_URL)
    database = "dashboards_test_" + gen_id()
    await admin.execute(f'CREATE DATABASE "{database}"')
    url = urlunsplit(urlsplit(POSTGRES_URL)._replace(path="/" + database))
    try:
        backend = get_backend(url)
        before_position = read_migrations(str(MIGRATIONS_PATH)).filter(
            lambda migration: not migration.id.startswith("0002.")
        )
        with backend.lock():
            backend.apply_migrations(backend.to_apply(before_position))
        connection = await asyncpg.connect(url)
        # Ids sort the other way round from creation time, so an ordering that
        # silently fell back to the primary key would be caught.
        await connection.executemany(
            "INSERT INTO dashboards (id, name, created_at, updated_at)"
            " VALUES ($1, $1, $2, $2)",
            [
                ("z-first", datetime(2026, 1, 1, tzinfo=UTC)),
                ("m-second", datetime(2026, 1, 2, tzinfo=UTC)),
                ("a-third", datetime(2026, 1, 3, tzinfo=UTC)),
            ],
        )
        await connection.close()

        service = DashboardsService(storage_url=url)
        await service.start()
        try:
            ids = [s.id for s in (await service.list()).items]
        finally:
            await service.stop()

        assert ids == ["z-first", "m-second", "a-third"]
    finally:
        await admin.execute(f'DROP DATABASE "{database}" WITH (FORCE)')
        await admin.close()
