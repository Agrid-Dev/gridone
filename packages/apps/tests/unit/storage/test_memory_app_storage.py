"""Unit tests for MemoryAppStorage's write semantics: the targeted updates,
and a `save` that leaves the stored status and message alone, like postgres."""

import pytest

from apps.models import App, AppStatus, PushStatus
from apps.storage.memory import MemoryAppStorage

pytestmark = pytest.mark.asyncio


def make_app(status_message: str | None = None) -> App:
    return App(
        id="app-1",
        user_id="user-1",
        name="Test App",
        description="A test app",
        api_url="https://myapp.example.com",
        icon="",
        status=AppStatus.REGISTERED,
        status_message=status_message,
        config={"lat": 48.8, "lng": 2.3},
        push_status=PushStatus.OK,
    )


@pytest.fixture
def storage() -> MemoryAppStorage:
    return MemoryAppStorage()


class TestSave:
    async def test_new_app_takes_the_models_status_and_message(self, storage):
        await storage.save(
            make_app(status_message="Starting").model_copy(
                update={"status": AppStatus.HEALTHY}
            )
        )

        stored = await storage.get_by_id("app-1")
        assert stored is not None
        assert (stored.status, stored.status_message) == (
            AppStatus.HEALTHY,
            "Starting",
        )

    async def test_existing_app_keeps_its_stored_status_and_message(self, storage):
        """Like postgres: only `update_status` writes the pair, and a saved
        model may predate the last health probe."""
        await storage.save(make_app())
        await storage.update_status("app-1", AppStatus.HEALTHY, "Sent to 3 of 14")

        # Still REGISTERED, and a message no probe sent.
        await storage.save(
            make_app(status_message="Stale").model_copy(update={"config": {"lat": 1}})
        )

        stored = await storage.get_by_id("app-1")
        assert stored is not None
        assert (stored.status, stored.status_message) == (
            AppStatus.HEALTHY,
            "Sent to 3 of 14",
        )
        assert stored.config == {"lat": 1}


class TestUpdateStatus:
    async def test_writes_status_and_message_only(self, storage):
        await storage.save(make_app())

        await storage.update_status("app-1", AppStatus.UNHEALTHY, "Upstream down")

        stored = await storage.get_by_id("app-1")
        assert stored is not None
        assert stored.status == AppStatus.UNHEALTHY
        assert stored.status_message == "Upstream down"
        assert stored.config == {"lat": 48.8, "lng": 2.3}
        assert stored.push_status == PushStatus.OK

    async def test_none_clears_the_message(self, storage):
        await storage.save(make_app(status_message="Sent to 3 of 14"))

        await storage.update_status("app-1", AppStatus.HEALTHY, None)

        stored = await storage.get_by_id("app-1")
        assert stored is not None
        assert stored.status_message is None

    async def test_unknown_id_is_a_no_op(self, storage):
        await storage.update_status("nonexistent", AppStatus.HEALTHY, "Hello")

        assert await storage.get_by_id("nonexistent") is None

    async def test_does_not_mutate_models_already_handed_out(self, storage):
        """Callers holding a snapshot must not see it change under them."""
        await storage.save(make_app())
        snapshot = await storage.get_by_id("app-1")

        await storage.update_status("app-1", AppStatus.UNHEALTHY, "Upstream down")

        assert snapshot is not None
        assert snapshot.status == AppStatus.REGISTERED
        assert snapshot.status_message is None


class TestUpdatePushStatus:
    async def test_leaves_config_and_status_intact(self, storage):
        await storage.save(make_app(status_message="Sent to 3 of 14"))

        await storage.update_push_status("app-1", PushStatus.PENDING)

        stored = await storage.get_by_id("app-1")
        assert stored is not None
        assert stored.push_status == PushStatus.PENDING
        assert stored.status == AppStatus.REGISTERED
        assert stored.status_message == "Sent to 3 of 14"
        assert stored.config == {"lat": 48.8, "lng": 2.3}

    async def test_unknown_id_is_a_no_op(self, storage):
        await storage.update_push_status("nonexistent", PushStatus.OK)

        assert await storage.get_by_id("nonexistent") is None
