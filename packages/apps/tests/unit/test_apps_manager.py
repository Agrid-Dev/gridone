"""Unit tests for AppsManager: app CRUD, enable/disable, and health checks."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from apps.apps_manager import AppsManager
from apps.errors import AppUnreachableError
from apps.models import App, AppStatus
from apps.registration_service import RegistrationService
from apps.service import AppsService
from apps.storage.factory import build_apps_storages
from conftest import make_app
from models.errors import InvalidError, NotFoundError

pytestmark = pytest.mark.asyncio


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
    async def test_returns_config(self, apps_manager, app_storage, http_client):
        await app_storage.save(make_app())
        config = {"lat": 48.8, "lng": 2.3}
        response = MagicMock()
        response.json.return_value = config
        http_client.request.return_value = response

        result = await apps_manager.get_config("app-1")

        assert result == config
        http_client.request.assert_called_once_with(
            "GET",
            "https://myapp.example.com/config",
            timeout=10.0,
            json=None,
        )

    async def test_app_unreachable(self, apps_manager, app_storage, http_client):
        await app_storage.save(make_app())
        http_client.request.side_effect = httpx.ConnectError("unreachable")

        with pytest.raises(AppUnreachableError):
            await apps_manager.get_config("app-1")


class TestUpdateConfig:
    async def test_returns_updated_config(self, apps_manager, app_storage, http_client):
        await app_storage.save(make_app())
        updated = {"lat": 40.7, "lng": -74.0}
        response = MagicMock()
        response.json.return_value = updated
        http_client.request.return_value = response

        result = await apps_manager.update_config("app-1", {"lat": 40.7, "lng": -74.0})

        assert result == updated
        http_client.request.assert_called_once_with(
            "PATCH",
            "https://myapp.example.com/config",
            timeout=10.0,
            json={"lat": 40.7, "lng": -74.0},
        )

    async def test_app_returns_422(self, apps_manager, app_storage, http_client):
        await app_storage.save(make_app())
        resp_mock = MagicMock()
        resp_mock.status_code = 422
        resp_mock.text = "Validation error"
        resp_mock.json.return_value = {"detail": "lat must be between -90 and 90"}
        http_client.request.side_effect = httpx.HTTPStatusError(
            "Unprocessable", request=MagicMock(), response=resp_mock
        )

        with pytest.raises(InvalidError, match="lat must be between"):
            await apps_manager.update_config("app-1", {"lat": 999})

    async def test_app_returns_500(self, apps_manager, app_storage, http_client):
        await app_storage.save(make_app())
        resp_mock = MagicMock()
        resp_mock.status_code = 500
        resp_mock.text = "Internal Server Error"
        resp_mock.json.return_value = {"detail": "Internal error"}
        http_client.request.side_effect = httpx.HTTPStatusError(
            "Server Error", request=MagicMock(), response=resp_mock
        )

        with pytest.raises(AppUnreachableError):
            await apps_manager.update_config("app-1", {"lat": 40.7})

    async def test_app_unreachable(self, apps_manager, app_storage, http_client):
        await app_storage.save(make_app())
        http_client.request.side_effect = httpx.ConnectError("unreachable")

        with pytest.raises(AppUnreachableError):
            await apps_manager.update_config("app-1", {"lat": 40.7})


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

        await apps_manager._check_all_apps_health()

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

        await apps_manager._check_all_apps_health()

        updated = await app_storage.get_by_id("app-1")
        assert updated is not None
        assert updated.status == AppStatus.UNHEALTHY

    async def test_unhealthy_app_connection_error(
        self, apps_manager, app_storage, http_client
    ):
        await app_storage.save(make_app(status=AppStatus.HEALTHY))
        http_client.get.side_effect = httpx.ConnectError("unreachable")

        await apps_manager._check_all_apps_health()

        updated = await app_storage.get_by_id("app-1")
        assert updated is not None
        assert updated.status == AppStatus.UNHEALTHY

    async def test_no_update_when_status_unchanged(
        self, apps_manager, app_storage, http_client
    ):
        await app_storage.save(make_app(status=AppStatus.HEALTHY))
        response = AsyncMock()
        response.is_success = True
        http_client.get.return_value = response

        original_save = app_storage.save
        save_calls = []

        async def tracked_save(app) -> None:
            save_calls.append(app)
            await original_save(app)

        app_storage.save = tracked_save

        await apps_manager._check_all_apps_health()

        assert len(save_calls) == 0

    async def test_start_and_stop_health_check(self, apps_manager):
        await apps_manager.start_health_check(interval_seconds=3600)
        assert apps_manager._health_task is not None
        assert not apps_manager._health_task.done()

        await apps_manager.stop_health_check()
        assert apps_manager._health_task is None

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
                await apps_manager._health_check_loop(60)
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

    def test_with_status(self):
        app = make_app(status=AppStatus.REGISTERED)
        updated = app.with_status(AppStatus.HEALTHY)
        assert updated.status == AppStatus.HEALTHY
        assert updated.id == app.id


class TestAppsManagerLifecycle:
    async def test_close_shuts_down_without_error(self, app_storage, users_manager):
        manager = AppsManager(app_storage, users_manager)
        await manager.close()


class TestStorageFactory:
    async def test_build_apps_storages_delegates_to_postgres(
        self, reg_storage, app_storage, monkeypatch
    ):
        async def mock_build(_url: str):  # noqa: ANN202
            return reg_storage, app_storage

        monkeypatch.setattr("apps.storage.postgres.build", mock_build)

        result = await build_apps_storages("postgresql://fake")
        assert result == (reg_storage, app_storage)


class TestAppsServiceLifecycle:
    async def test_from_storage_rejects_non_postgres(self, users_manager):
        with pytest.raises(ValueError, match="requires PostgreSQL"):
            await AppsService.from_storage("/data/not-postgres", users_manager)

    async def test_from_storage_success(
        self, reg_storage, app_storage, users_manager, monkeypatch
    ):
        async def mock_build(_url: str):  # noqa: ANN202
            return reg_storage, app_storage

        monkeypatch.setattr("apps.service.build_apps_storages", mock_build)
        service = await AppsService.from_storage("postgresql://fake", users_manager)
        assert service.registration is not None
        assert service.apps is not None
        await service.close()

    async def test_init_and_attributes(self, reg_storage, app_storage, users_manager):
        registration = RegistrationService(reg_storage, app_storage, users_manager)
        apps_mgr = AppsManager(app_storage, users_manager)
        service = AppsService(registration, apps_mgr)

        assert service.registration is registration
        assert service.apps is apps_mgr

    async def test_close_delegates(self, reg_storage, app_storage, users_manager):
        registration = RegistrationService(reg_storage, app_storage, users_manager)
        apps_mgr = AppsManager(app_storage, users_manager)
        service = AppsService(registration, apps_mgr)
        await service.close()

    async def test_start_health_check_delegates(
        self, reg_storage, app_storage, users_manager
    ):
        registration = RegistrationService(reg_storage, app_storage, users_manager)
        apps_mgr = AppsManager(app_storage, users_manager)
        service = AppsService(registration, apps_mgr)
        await service.start_health_check(interval_seconds=3600)
        assert apps_mgr._health_task is not None
        await service.close()
