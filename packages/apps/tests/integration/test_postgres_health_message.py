"""Integration tests: health messages through the real health loop into
``PostgresAppStorage``.

Started by an independent tester, whose tests pinned a message Postgres could
not store blocking the status write and the config re-delivery. Opt-in via
``POSTGRES_TEST_URL``, like the other integration tests.
"""

from __future__ import annotations

import json
import os
from unittest.mock import AsyncMock

import asyncpg
import httpx
import pytest
import pytest_asyncio

from apps.apps_manager import AppsManager
from apps.models import App, AppStatus, PushStatus
from apps.storage.postgres import PostgresAppStorage, run_migrations
from users import UsersServiceInterface

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]

CONFIG = {"lat": 48.8566}


@pytest_asyncio.fixture
async def storage():
    assert POSTGRES_URL is not None
    run_migrations(POSTGRES_URL)
    pool = await asyncpg.create_pool(POSTGRES_URL)
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM apps")
    yield PostgresAppStorage(pool)
    await pool.close()


def _app(**updates: object) -> App:
    app = App(
        id="app-1",
        user_id="user-1",
        name="Logo",
        description="Puts a logo on the thermostats",
        api_url="https://logo.example.com",
        icon="image",
        status=AppStatus.HEALTHY,
        config=CONFIG,
        push_status=PushStatus.OK,
    )
    return app.model_copy(update=updates)


class _FakeApp:
    """The app side of the contract: `/health` answers `health`, `PATCH
    /config` records what it receives."""

    def __init__(self, health: dict[str, object]) -> None:
        self.health = health
        self.pushed: list[object] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            # `json.dumps` escapes as ASCII, as a real app's JSON would.
            return httpx.Response(
                200,
                content=json.dumps(self.health).encode(),
                headers={"content-type": "application/json"},
            )
        if request.method == "PATCH" and request.url.path == "/config":
            self.pushed.append(json.loads(request.content))
            return httpx.Response(200, json={})
        return httpx.Response(404)


def _manager(storage: PostgresAppStorage, fake: _FakeApp) -> AppsManager:
    users = AsyncMock(spec=UsersServiceInterface)
    client = httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))
    return AppsManager(storage, users, client)


async def test_a_message_round_trips_cut_to_200_characters(
    storage: PostgresAppStorage,
) -> None:
    fake = _FakeApp({"status": "ok", "message": "  " + "é" * 250 + "  "})
    manager = _manager(storage, fake)
    await storage.save(_app())

    await manager._check_all_apps_health()  # noqa: SLF001
    await manager.close()

    stored = await storage.get_by_id("app-1")
    assert stored is not None
    assert (stored.status, stored.status_message) == (AppStatus.HEALTHY, "é" * 200)


async def test_a_config_save_keeps_the_message_the_loop_wrote(
    storage: PostgresAppStorage,
) -> None:
    fake = _FakeApp({"status": "ok", "message": "Sent to 3 of 14"})
    manager = _manager(storage, fake)
    await storage.save(_app())
    await manager._check_all_apps_health()  # noqa: SLF001
    await manager.close()
    # The save below comes from a model that never saw the message.
    stale = _app(config={"lat": 1.0}, status_message=None)

    await storage.save(stale)

    stored = await storage.get_by_id("app-1")
    assert stored is not None
    assert stored.status_message == "Sent to 3 of 14"
    assert stored.config == {"lat": 1.0}


@pytest.mark.parametrize(
    ("message", "stored_message"),
    [
        pytest.param("Sent to 3\u0000 of 14", "Sent to 3 of 14", id="nul"),
        pytest.param("Sent \ud83d of 14", "Sent \ufffd of 14", id="lone-surrogate"),
    ],
)
async def test_an_unstorable_message_is_cleaned_and_blocks_nothing(
    storage: PostgresAppStorage, message: str, stored_message: str
) -> None:
    """Postgres refuses a NUL, and UTF-8 cannot encode a lone surrogate: as
    sent, either would fail the status write — and the needs_config
    re-delivery after it — tick after tick."""
    fake = _FakeApp({"status": "needs_config", "message": message})
    manager = _manager(storage, fake)
    await storage.save(_app())

    await manager._check_all_apps_health()  # noqa: SLF001
    await manager.close()

    stored = await storage.get_by_id("app-1")
    assert stored is not None
    assert (stored.status, stored.status_message) == (
        AppStatus.NEEDS_CONFIG,
        stored_message,
    )
    assert fake.pushed == [CONFIG]
