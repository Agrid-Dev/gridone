"""Integration tests for ``PostgresAppStorage``.

Exercises the real asyncpg round-trip — the ``config`` jsonb encode/decode
(asyncpg has no codec registered here, so the storage does it explicitly)
and the targeted ``update_status`` / ``update_push_status`` writes that keep
a status change from carrying a stale config. Opt-in via
``POSTGRES_TEST_URL``; skipped when unset so the default suite stays
hermetic.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime

import asyncpg
import pytest
import pytest_asyncio

from apps.models import App, AppStatus, PushStatus
from apps.storage.postgres import PostgresAppStorage, run_migrations

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


def _make_app(
    app_id: str = "app-1",
    *,
    user_id: str = "user-1",
    status: AppStatus = AppStatus.REGISTERED,
    config: dict | None = None,
    push_status: PushStatus | None = None,
) -> App:
    return App(
        id=app_id,
        user_id=user_id,
        name="Test App",
        description="A test app",
        api_url="https://myapp.example.com",
        icon="https://myapp.example.com/icon.png",
        status=status,
        manifest="name: Test App\n",
        created_at=datetime(2026, 7, 30, 12, 0, tzinfo=UTC),
        config=config,
        push_status=push_status,
    )


@pytest_asyncio.fixture
async def storage():
    assert POSTGRES_URL is not None
    run_migrations(POSTGRES_URL)
    pool = await asyncpg.create_pool(POSTGRES_URL)
    store = PostgresAppStorage(pool)

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM apps")

    yield store

    await pool.close()


class TestRoundTrip:
    async def test_config_jsonb_and_push_status_survive(
        self, storage: PostgresAppStorage
    ) -> None:
        config = {"lat": 48.8566, "lng": 2.3522, "nested": {"a": [1, 2, 3]}}
        await storage.save(_make_app(config=config, push_status=PushStatus.OK))

        fetched = await storage.get_by_id("app-1")

        assert fetched is not None
        assert fetched.config == config
        assert fetched.push_status == PushStatus.OK
        assert fetched.created_at == datetime(2026, 7, 30, 12, 0, tzinfo=UTC)

    async def test_never_configured_app_round_trips_as_none(
        self, storage: PostgresAppStorage
    ) -> None:
        await storage.save(_make_app())

        fetched = await storage.get_by_id("app-1")

        assert fetched is not None
        assert fetched.config is None
        assert fetched.push_status is None

    async def test_save_upserts_config(self, storage: PostgresAppStorage) -> None:
        await storage.save(_make_app(config={"lat": 1.0}))
        await storage.save(
            _make_app(config={"lat": 2.0}, push_status=PushStatus.PENDING)
        )

        fetched = await storage.get_by_id("app-1")

        assert fetched is not None
        assert fetched.config == {"lat": 2.0}
        assert fetched.push_status == PushStatus.PENDING

    async def test_list_all_maps_every_row(self, storage: PostgresAppStorage) -> None:
        await storage.save(_make_app("app-1", config={"lat": 1.0}))
        await storage.save(_make_app("app-2", user_id="user-2"))

        apps = await storage.list_all()

        assert {a.id for a in apps} == {"app-1", "app-2"}
        by_id = {a.id: a for a in apps}
        assert by_id["app-1"].config == {"lat": 1.0}
        assert by_id["app-2"].config is None


class TestUpdateStatus:
    async def test_leaves_config_and_push_status_intact(
        self, storage: PostgresAppStorage
    ) -> None:
        config = {"lat": 48.8566, "lng": 2.3522}
        await storage.save(_make_app(config=config, push_status=PushStatus.OK))

        await storage.update_status("app-1", AppStatus.UNHEALTHY)

        fetched = await storage.get_by_id("app-1")
        assert fetched is not None
        assert fetched.status == AppStatus.UNHEALTHY
        assert fetched.config == config
        assert fetched.push_status == PushStatus.OK

    async def test_unknown_id_is_a_no_op(self, storage: PostgresAppStorage) -> None:
        await storage.update_status("nonexistent", AppStatus.HEALTHY)

        assert await storage.get_by_id("nonexistent") is None


class TestUpdatePushStatus:
    async def test_leaves_config_and_status_intact(
        self, storage: PostgresAppStorage
    ) -> None:
        config = {"lat": 48.8566, "lng": 2.3522}
        await storage.save(
            _make_app(status=AppStatus.HEALTHY, config=config, push_status=None)
        )

        await storage.update_push_status("app-1", PushStatus.REJECTED)

        fetched = await storage.get_by_id("app-1")
        assert fetched is not None
        assert fetched.push_status == PushStatus.REJECTED
        assert fetched.status == AppStatus.HEALTHY
        assert fetched.config == config

    async def test_unknown_id_is_a_no_op(self, storage: PostgresAppStorage) -> None:
        await storage.update_push_status("nonexistent", PushStatus.OK)

        assert await storage.get_by_id("nonexistent") is None
