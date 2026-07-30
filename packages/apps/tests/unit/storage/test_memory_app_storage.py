"""Unit tests for MemoryAppStorage's targeted update semantics."""

import pytest

from apps.models import App, AppStatus, PushStatus
from apps.storage.memory import MemoryAppStorage

pytestmark = pytest.mark.asyncio


def make_app() -> App:
    return App(
        id="app-1",
        user_id="user-1",
        name="Test App",
        description="A test app",
        api_url="https://myapp.example.com",
        icon="",
        status=AppStatus.REGISTERED,
        config={"lat": 48.8, "lng": 2.3},
        push_status=PushStatus.OK,
    )


@pytest.fixture
def storage() -> MemoryAppStorage:
    return MemoryAppStorage()


class TestUpdateStatus:
    async def test_leaves_config_and_push_status_intact(self, storage):
        await storage.save(make_app())

        await storage.update_status("app-1", AppStatus.UNHEALTHY)

        stored = await storage.get_by_id("app-1")
        assert stored is not None
        assert stored.status == AppStatus.UNHEALTHY
        assert stored.config == {"lat": 48.8, "lng": 2.3}
        assert stored.push_status == PushStatus.OK

    async def test_unknown_id_is_a_no_op(self, storage):
        await storage.update_status("nonexistent", AppStatus.HEALTHY)

        assert await storage.get_by_id("nonexistent") is None

    async def test_does_not_mutate_models_already_handed_out(self, storage):
        """Callers holding a snapshot must not see it change under them."""
        await storage.save(make_app())
        snapshot = await storage.get_by_id("app-1")

        await storage.update_status("app-1", AppStatus.UNHEALTHY)

        assert snapshot is not None
        assert snapshot.status == AppStatus.REGISTERED


class TestUpdatePushStatus:
    async def test_leaves_config_and_status_intact(self, storage):
        await storage.save(make_app())

        await storage.update_push_status("app-1", PushStatus.PENDING)

        stored = await storage.get_by_id("app-1")
        assert stored is not None
        assert stored.push_status == PushStatus.PENDING
        assert stored.status == AppStatus.REGISTERED
        assert stored.config == {"lat": 48.8, "lng": 2.3}

    async def test_unknown_id_is_a_no_op(self, storage):
        await storage.update_push_status("nonexistent", PushStatus.OK)

        assert await storage.get_by_id("nonexistent") is None
