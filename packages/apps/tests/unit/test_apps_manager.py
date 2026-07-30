"""Unit tests for AppsManager: app CRUD, enable/disable, and health checks."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from conftest import make_app

from apps.apps_manager import AppsManager
from apps.errors import AppUnreachableError, InvalidAppSchemaError
from apps.models import App, AppStatus, PushStatus
from apps.storage.storage_backend import AppStorageBackend
from models.errors import InvalidError, NotFoundError

pytestmark = pytest.mark.asyncio

DUMMY_CONFIG_SCHEMA = {
    "type": "object",
    "properties": {"lat": {"type": "number"}, "lng": {"type": "number"}},
    "required": ["lat", "lng"],
}


def schema_response() -> MagicMock:
    """Stub the app's `GET /config/schema` reply."""
    response = MagicMock()
    response.json.return_value = DUMMY_CONFIG_SCHEMA
    return response


@pytest.fixture
def apps_manager(app_storage, users_manager, http_client) -> AppsManager:
    return AppsManager(app_storage, users_manager, http_client)


class TestListApps:
    async def test_list_empty(self, apps_manager):
        result = await apps_manager.list_apps()
        assert result == []

    async def test_list_returns_all(self, apps_manager, app_storage):
        await app_storage.save(make_app("app-1"))
        await app_storage.save(make_app("app-2", user_id="user-2"))
        result = await apps_manager.list_apps()
        assert len(result) == 2


class TestGetApp:
    async def test_get_existing(self, apps_manager, app_storage):
        await app_storage.save(make_app())
        fetched = await apps_manager.get_app("app-1")
        assert fetched.id == "app-1"
        assert fetched.name == "Test App"

    async def test_get_not_found(self, apps_manager):
        with pytest.raises(NotFoundError, match="App 'nonexistent' not found"):
            await apps_manager.get_app("nonexistent")


class TestGetConfigSchema:
    async def test_returns_schema(self, apps_manager, app_storage, http_client):
        await app_storage.save(make_app())
        schema = {"type": "object", "properties": {"lat": {"type": "number"}}}
        response = MagicMock()
        response.json.return_value = schema
        http_client.request.return_value = response

        result = await apps_manager.get_config_schema("app-1")

        assert result == schema
        http_client.request.assert_called_once_with(
            "GET",
            "https://myapp.example.com/config/schema",
            timeout=10.0,
            json=None,
        )

    async def test_app_not_found(self, apps_manager):
        with pytest.raises(NotFoundError):
            await apps_manager.get_config_schema("nonexistent")

    async def test_app_unreachable(self, apps_manager, app_storage, http_client):
        await app_storage.save(make_app())
        http_client.request.side_effect = httpx.ConnectError("unreachable")

        with pytest.raises(AppUnreachableError):
            await apps_manager.get_config_schema("app-1")

    async def test_app_returns_404(self, apps_manager, app_storage, http_client):
        await app_storage.save(make_app())
        resp_mock = MagicMock()
        resp_mock.status_code = 404
        resp_mock.text = "Not Found"
        resp_mock.json.return_value = {"detail": "No config"}
        http_client.request.side_effect = httpx.HTTPStatusError(
            "Not Found", request=MagicMock(), response=resp_mock
        )

        with pytest.raises(NotFoundError, match="No config"):
            await apps_manager.get_config_schema("app-1")

    async def test_app_returns_error_with_unparseable_json(
        self, apps_manager, app_storage, http_client
    ):
        await app_storage.save(make_app())
        resp_mock = MagicMock()
        resp_mock.status_code = 422
        resp_mock.text = "plain text error"
        resp_mock.json.side_effect = ValueError("not JSON")
        http_client.request.side_effect = httpx.HTTPStatusError(
            "Unprocessable", request=MagicMock(), response=resp_mock
        )

        with pytest.raises(InvalidError, match="plain text error"):
            await apps_manager.get_config_schema("app-1")


class TestGetConfig:
    async def test_returns_stored_config(self, apps_manager, app_storage):
        app = make_app().model_copy(update={"config": {"lat": 48.8, "lng": 2.3}})
        await app_storage.save(app)

        result = await apps_manager.get_config("app-1")

        assert result == {"lat": 48.8, "lng": 2.3}

    async def test_never_configured_returns_empty_dict(self, apps_manager, app_storage):
        await app_storage.save(make_app())

        result = await apps_manager.get_config("app-1")

        assert result == {}

    async def test_app_not_found(self, apps_manager):
        with pytest.raises(NotFoundError):
            await apps_manager.get_config("nonexistent")


class TestUpdateConfig:
    async def test_schema_fetch_unreachable_stores_nothing(
        self, apps_manager, app_storage, http_client
    ):
        await app_storage.save(make_app())
        http_client.request.side_effect = httpx.ConnectError("unreachable")

        with pytest.raises(AppUnreachableError):
            await apps_manager.update_config("app-1", {"lat": 40.7, "lng": -74.0})

        stored = await app_storage.get_by_id("app-1")
        assert stored is not None
        assert stored.config is None
        assert http_client.request.call_count == 1

    async def test_invalid_payload_stores_nothing(
        self, apps_manager, app_storage, http_client
    ):
        await app_storage.save(make_app())
        http_client.request.side_effect = [schema_response()]

        with pytest.raises(InvalidError):
            await apps_manager.update_config("app-1", {"lat": 40.7})  # missing lng

        stored = await app_storage.get_by_id("app-1")
        assert stored is not None
        assert stored.config is None
        assert http_client.request.call_count == 1

    async def test_malformed_schema_stores_nothing(
        self, apps_manager, app_storage, http_client
    ):
        """A schema the app itself got wrong must not be blamed on the payload."""
        await app_storage.save(make_app())
        bad_schema = MagicMock()
        bad_schema.json.return_value = {"type": "not-a-json-type"}
        http_client.request.side_effect = [bad_schema]

        with pytest.raises(InvalidAppSchemaError):
            await apps_manager.update_config("app-1", {"lat": 40.7, "lng": -74.0})

        stored = await app_storage.get_by_id("app-1")
        assert stored is not None
        assert stored.config is None
        assert http_client.request.call_count == 1

    async def test_full_success_stores_config_and_pushes(
        self, apps_manager, app_storage, http_client
    ):
        await app_storage.save(make_app())
        push_response = MagicMock()
        http_client.request.side_effect = [schema_response(), push_response]

        result = await apps_manager.update_config("app-1", {"lat": 40.7, "lng": -74.0})

        assert result.config == {"lat": 40.7, "lng": -74.0}
        assert result.push_status == PushStatus.OK
        stored = await app_storage.get_by_id("app-1")
        assert stored is not None
        assert stored.config == {"lat": 40.7, "lng": -74.0}
        assert stored.push_status == PushStatus.OK
        assert http_client.request.call_count == 2
        push_call = http_client.request.call_args_list[1]
        assert push_call.args == ("PATCH", "https://myapp.example.com/config")
        assert push_call.kwargs == {
            "timeout": 10.0,
            "json": {"lat": 40.7, "lng": -74.0},
        }

    async def test_push_rejected_stores_rejected_status(
        self, apps_manager, app_storage, http_client
    ):
        await app_storage.save(make_app())
        resp_mock = MagicMock()
        resp_mock.status_code = 422
        push_error = httpx.HTTPStatusError(
            "Unprocessable", request=MagicMock(), response=resp_mock
        )
        http_client.request.side_effect = [schema_response(), push_error]

        result = await apps_manager.update_config("app-1", {"lat": 40.7, "lng": -74.0})

        assert result.push_status == PushStatus.REJECTED
        stored = await app_storage.get_by_id("app-1")
        assert stored is not None
        assert stored.push_status == PushStatus.REJECTED
        assert stored.config == {"lat": 40.7, "lng": -74.0}

    async def test_push_unreachable_stores_pending_status(
        self, apps_manager, app_storage, http_client
    ):
        await app_storage.save(make_app())
        http_client.request.side_effect = [
            schema_response(),
            httpx.ConnectError("unreachable"),
        ]

        result = await apps_manager.update_config("app-1", {"lat": 40.7, "lng": -74.0})

        assert result.push_status == PushStatus.PENDING
        stored = await app_storage.get_by_id("app-1")
        assert stored is not None
        assert stored.push_status == PushStatus.PENDING
        assert stored.config == {"lat": 40.7, "lng": -74.0}

    async def test_push_5xx_stores_pending_status(
        self, apps_manager, app_storage, http_client
    ):
        await app_storage.save(make_app())
        resp_mock = MagicMock()
        resp_mock.status_code = 500
        push_error = httpx.HTTPStatusError(
            "Server Error", request=MagicMock(), response=resp_mock
        )
        http_client.request.side_effect = [schema_response(), push_error]

        result = await apps_manager.update_config("app-1", {"lat": 40.7, "lng": -74.0})

        assert result.push_status == PushStatus.PENDING
        stored = await app_storage.get_by_id("app-1")
        assert stored is not None
        assert stored.push_status == PushStatus.PENDING

    async def test_push_window_preserves_concurrent_status_flip(
        self, apps_manager, app_storage, http_client
    ):
        """A health flip landing during the push must survive the final write.

        The flip is injected during the *push*, not the schema fetch: the
        post-push write touches `push_status` only, whereas the pre-push
        write is deliberately still a full-row save of the config the
        client just supplied.
        """
        await app_storage.save(make_app(status=AppStatus.HEALTHY))

        async def request(_method: str, url: str, **_kwargs: object) -> MagicMock:
            if url.endswith("/config/schema"):
                return schema_response()
            # The push is in flight — a health flip commits right now.
            await app_storage.update_status("app-1", AppStatus.UNHEALTHY)
            return MagicMock()

        http_client.request.side_effect = request

        await apps_manager.update_config("app-1", {"lat": 40.7, "lng": -74.0})

        stored = await app_storage.get_by_id("app-1")
        assert stored is not None
        assert stored.status == AppStatus.UNHEALTHY
        assert stored.config == {"lat": 40.7, "lng": -74.0}
        assert stored.push_status == PushStatus.OK

    async def test_push_status_write_is_targeted(self, users_manager, http_client):
        """The post-push write must not carry the whole row a second time."""
        storage = AsyncMock(spec=AppStorageBackend)
        storage.get_by_id.return_value = make_app()
        manager = AppsManager(storage, users_manager, http_client)
        http_client.request.side_effect = [schema_response(), MagicMock()]

        await manager.update_config("app-1", {"lat": 40.7, "lng": -74.0})

        storage.update_push_status.assert_awaited_once_with("app-1", PushStatus.OK)
        # Exactly one full-row save: the authoritative config write.
        assert storage.save.await_count == 1


class TestEnableApp:
    async def test_enable_calls_app_and_unblocks_user(
        self, apps_manager, app_storage, http_client, users_manager
    ):
        await app_storage.save(make_app())
        result = await apps_manager.enable_app("app-1")

        assert result.id == "app-1"
        http_client.post.assert_called_once_with(
            "https://myapp.example.com/enable",
            json={"enabled": True},
            timeout=10.0,
        )
        users_manager.unblock_user.assert_called_once_with("user-1")

    async def test_enable_http_failure_still_unblocks(
        self, apps_manager, app_storage, http_client, users_manager
    ):
        await app_storage.save(make_app())
        http_client.post.side_effect = httpx.ConnectError("unreachable")

        result = await apps_manager.enable_app("app-1")

        assert result.id == "app-1"
        users_manager.unblock_user.assert_called_once_with("user-1")

    async def test_enable_not_found(self, apps_manager):
        with pytest.raises(NotFoundError):
            await apps_manager.enable_app("nonexistent")


class TestDisableApp:
    async def test_disable_calls_app_and_blocks_user(
        self, apps_manager, app_storage, http_client, users_manager
    ):
        await app_storage.save(make_app())
        result = await apps_manager.disable_app("app-1")

        assert result.id == "app-1"
        http_client.post.assert_called_once_with(
            "https://myapp.example.com/enable",
            json={"enabled": False},
            timeout=10.0,
        )
        users_manager.block_user.assert_called_once_with("user-1")

    async def test_disable_http_failure_still_blocks(
        self, apps_manager, app_storage, http_client, users_manager
    ):
        await app_storage.save(make_app())
        http_client.post.side_effect = httpx.ConnectError("unreachable")

        result = await apps_manager.disable_app("app-1")

        assert result.id == "app-1"
        users_manager.block_user.assert_called_once_with("user-1")

    async def test_disable_not_found(self, apps_manager):
        with pytest.raises(NotFoundError):
            await apps_manager.disable_app("nonexistent")


class TestHealthCheck:
    async def test_healthy_app(self, apps_manager, app_storage, http_client):
        await app_storage.save(make_app(status=AppStatus.REGISTERED))
        response = AsyncMock()
        response.is_success = True
        http_client.get.return_value = response

        await apps_manager._check_all_apps_health()  # noqa: SLF001

        http_client.get.assert_called_once_with(
            "https://myapp.example.com/health",
            timeout=5.0,
        )
        updated = await app_storage.get_by_id("app-1")
        assert updated is not None
        assert updated.status == AppStatus.HEALTHY

    async def test_unhealthy_app_bad_status(
        self, apps_manager, app_storage, http_client
    ):
        await app_storage.save(make_app(status=AppStatus.HEALTHY))
        response = AsyncMock()
        response.is_success = False
        http_client.get.return_value = response

        await apps_manager._check_all_apps_health()  # noqa: SLF001

        updated = await app_storage.get_by_id("app-1")
        assert updated is not None
        assert updated.status == AppStatus.UNHEALTHY

    async def test_unhealthy_app_connection_error(
        self, apps_manager, app_storage, http_client
    ):
        await app_storage.save(make_app(status=AppStatus.HEALTHY))
        http_client.get.side_effect = httpx.ConnectError("unreachable")

        await apps_manager._check_all_apps_health()  # noqa: SLF001

        updated = await app_storage.get_by_id("app-1")
        assert updated is not None
        assert updated.status == AppStatus.UNHEALTHY

    async def test_no_update_when_status_unchanged(self, users_manager, http_client):
        storage = AsyncMock(spec=AppStorageBackend)
        storage.list_all.return_value = [make_app(status=AppStatus.HEALTHY)]
        manager = AppsManager(storage, users_manager, http_client)
        response = AsyncMock()
        response.is_success = True
        http_client.get.return_value = response

        await manager._check_all_apps_health()  # noqa: SLF001

        storage.update_status.assert_not_awaited()
        storage.save.assert_not_awaited()

    async def test_status_change_uses_targeted_update(self, users_manager, http_client):
        """A status change must never carry a full row, stale config included."""
        storage = AsyncMock(spec=AppStorageBackend)
        storage.list_all.return_value = [make_app(status=AppStatus.REGISTERED)]
        manager = AppsManager(storage, users_manager, http_client)
        response = AsyncMock()
        response.is_success = True
        http_client.get.return_value = response

        await manager._check_all_apps_health()  # noqa: SLF001

        storage.update_status.assert_awaited_once_with("app-1", AppStatus.HEALTHY)
        storage.save.assert_not_awaited()

    async def test_status_change_preserves_concurrently_written_config(
        self, apps_manager, app_storage, http_client
    ):
        """A config PATCH committing during a health probe must survive.

        The health loop snapshots every app before awaiting its probe, so a
        full-row write from that snapshot would revert a config stored in the
        meantime — after the client already got a 200.
        """
        await app_storage.save(make_app(status=AppStatus.REGISTERED))

        async def request(_method: str, url: str, **_kwargs: object) -> MagicMock:
            return schema_response() if url.endswith("/config/schema") else MagicMock()

        http_client.request.side_effect = request

        async def probe(*_args: object, **_kwargs: object) -> AsyncMock:
            # PATCH /apps/app-1/config commits while the probe is in flight.
            await apps_manager.update_config("app-1", {"lat": 1.0, "lng": 2.0})
            response = AsyncMock()
            response.is_success = True
            return response

        http_client.get.side_effect = probe

        await apps_manager._check_all_apps_health()  # noqa: SLF001

        stored = await app_storage.get_by_id("app-1")
        assert stored is not None
        assert stored.config == {"lat": 1.0, "lng": 2.0}
        assert stored.push_status == PushStatus.OK
        assert stored.status == AppStatus.HEALTHY

    async def test_start_and_stop_health_check(self, apps_manager):
        await apps_manager.start_health_check(interval_seconds=3600)
        assert apps_manager._health_task is not None  # noqa: SLF001
        assert not apps_manager._health_task.done()  # noqa: SLF001

        await apps_manager.stop_health_check()
        assert apps_manager._health_task is None  # noqa: SLF001

    async def test_health_check_loop_runs_and_sleeps(
        self, apps_manager, app_storage, http_client
    ):
        """Verify the loop body executes _check_all_apps_health then sleeps."""
        await app_storage.save(make_app(status=AppStatus.REGISTERED))
        response = AsyncMock()
        response.is_success = True
        http_client.get.return_value = response

        original_sleep = asyncio.sleep

        async def cancel_on_sleep(_seconds: float) -> None:
            raise asyncio.CancelledError

        asyncio.sleep = cancel_on_sleep  # type: ignore[assignment]
        try:
            with pytest.raises(asyncio.CancelledError):
                await apps_manager._health_check_loop(60)  # noqa: SLF001
        finally:
            asyncio.sleep = original_sleep

        # The loop body ran once before being cancelled
        http_client.get.assert_called_once()


class TestAppModel:
    def test_health_url_property(self):
        app = make_app()
        assert app.health_url == "https://myapp.example.com/health"

    def test_enable_url_property(self):
        app = make_app()
        assert app.enable_url == "https://myapp.example.com/enable"

    def test_api_url_strips_trailing_slash(self):
        app = App(
            id="x",
            user_id="u",
            name="n",
            description="d",
            api_url="https://example.com/",
            icon="i",
        )
        assert app.api_url == "https://example.com"
        assert app.health_url == "https://example.com/health"
        assert app.enable_url == "https://example.com/enable"

    def test_config_excluded_from_serialization(self):
        app = make_app().model_copy(
            update={"config": {"secret": "shh"}, "push_status": PushStatus.OK}
        )
        dumped = app.model_dump()
        assert "config" not in dumped
        assert dumped["push_status"] == PushStatus.OK


class TestMemoryAppStorageRoundTrip:
    async def test_config_and_push_status_survive_save_and_get(self, app_storage):
        app = make_app().model_copy(
            update={"config": {"lat": 1.0, "lng": 2.0}, "push_status": PushStatus.OK}
        )
        await app_storage.save(app)

        fetched = await app_storage.get_by_id("app-1")

        assert fetched is not None
        assert fetched.config == {"lat": 1.0, "lng": 2.0}
        assert fetched.push_status == PushStatus.OK

    async def test_never_configured_app_has_no_config_or_push_status(self, app_storage):
        await app_storage.save(make_app())

        fetched = await app_storage.get_by_id("app-1")

        assert fetched is not None
        assert fetched.config is None
        assert fetched.push_status is None


class TestAppsManagerLifecycle:
    async def test_close_shuts_down_without_error(self, app_storage, users_manager):
        manager = AppsManager(app_storage, users_manager)
        await manager.close()
