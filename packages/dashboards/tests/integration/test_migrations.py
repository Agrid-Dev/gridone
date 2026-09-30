"""Upgrading a deployment: what the migrations make of existing rows."""

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


async def _database_migrated_up_to(admin: asyncpg.Connection, last: str) -> str:
    """A throwaway database on which only the migrations up to ``last``
    (inclusive, by id prefix) have run; the next service start runs the rest."""
    assert POSTGRES_URL is not None
    database = "dashboards_test_" + gen_id()
    await admin.execute(f'CREATE DATABASE "{database}"')
    url = urlunsplit(urlsplit(POSTGRES_URL)._replace(path="/" + database))
    backend = get_backend(url)
    applied = read_migrations(str(MIGRATIONS_PATH)).filter(
        lambda migration: migration.id[:4] <= last
    )
    with backend.lock():
        backend.apply_migrations(backend.to_apply(applied))
    return url


async def _listed_ids(url: str) -> list[str]:
    service = DashboardsService(storage_url=url)
    await service.start()
    try:
        return [s.id for s in (await service.list()).items]
    finally:
        await service.stop()


async def test_existing_dashboards_keep_creation_order():
    assert POSTGRES_URL is not None
    admin = await asyncpg.connect(POSTGRES_URL)
    url = await _database_migrated_up_to(admin, "0001")
    try:
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

        assert await _listed_ids(url) == ["z-first", "m-second", "a-third"]
    finally:
        await admin.execute(f'DROP DATABASE "{url.rsplit("/", 1)[1]}" WITH (FORCE)')
        await admin.close()


async def test_existing_dashboards_have_no_icon():
    assert POSTGRES_URL is not None
    admin = await asyncpg.connect(POSTGRES_URL)
    url = await _database_migrated_up_to(admin, "0002")
    try:
        connection = await asyncpg.connect(url)
        await connection.execute(
            "INSERT INTO dashboards (id, name, position) VALUES ('legacy', 'Legacy', 0)"
        )
        await connection.close()

        service = DashboardsService(storage_url=url)
        await service.start()
        try:
            assert (await service.list()).items[0].icon is None
            assert (await service.get("legacy")).icon is None
        finally:
            await service.stop()
    finally:
        await admin.execute(f'DROP DATABASE "{url.rsplit("/", 1)[1]}" WITH (FORCE)')
        await admin.close()
