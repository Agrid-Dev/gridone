"""Unit tests for App CRUD, health monitoring, and enable/disable."""

from unittest.mock import AsyncMock

import httpx
import pytest
from apps.models import App, AppStatus
from models.errors import NotFoundError
from users import UsersManagerInterface
from users.models import User, UserType

from apps import AppsManager

pytestmark = pytest.mark.asyncio

VALID_CONFIG = (
    "name: My App\n"
    "api_url: https://example.com\n"
    "description: A test application\n"
    "icon: https://example.com/icon.png\n"
)


# ── In-memory storage doubles ────────────────────────────────────────────


class InMemoryAppStorage:
    """Minimal in-memory storage for App records."""

    def __init__(self) -> None:
        self._apps: dict[str, App] = {}

    async def get_by_id(self, app_id: str) -> App | None:
        return self._apps.get(app_id)

    async def list_all(self) -> list[App]:
        return list(self._apps.values())

    async def save(self, app: App) -> None:
        self._apps[app.id] = app

    async def close(self) -> None:
        pass


class InMemoryRegistrationStorage:
    """Stub registration storage (unused in these tests)."""

    def __init__(self) -> None:
        self._requests: dict = {}

    async def get_by_id(self, request_id: str):
        return self._requests.get(request_id)

    async def list_all(self):
        return list(self._requests.values())

    async def save(self, request) -> None:
        self._requests[request.id] = request

    async def close(self) -> None:
        pass


def _make_app(
    app_id: str = "app-1",
    user_id: str = "user-1",
    status: AppStatus = AppStatus.REGISTERED,
) -> App:
    return App(
        id=app_id,
        user_id=user_id,
        name="Test App",
        description="A test app",
        api_url="https://myapp.example.com",
        icon="https://myapp.example.com/icon.png",
        status=status,
        manifest=VALID_CONFIG,
    )


# ── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def app_storage() -> InMemoryAppStorage:
    return InMemoryAppStorage()


@pytest.fixture
def reg_storage() -> InMemoryRegistrationStorage:
    return InMemoryRegistrationStorage()


@pytest.fixture
def users_manager() -> AsyncMock:
    mock = AsyncMock(spec=UsersManagerInterface)
    mock.block_user.return_value = User(
        id="user-1", username="app-user", type=UserType.SERVICE_ACCOUNT, is_blocked=True
    )
    mock.unblock_user.return_value = User(
        id="user-1",
        username="app-user",
        type=UserType.SERVICE_ACCOUNT,
        is_blocked=False,
    )
    return mock


@pytest.fixture
def http_client() -> AsyncMock:
    mock = AsyncMock(spec=httpx.AsyncClient)
    mock.aclose = AsyncMock()
    response = AsyncMock()
    response.is_success = True
    mock.post.return_value = response
    mock.get.return_value = response
    return mock


@pytest.fixture
def apps_manager(reg_storage, app_storage, users_manager, http_client) -> AppsManager:
    return AppsManager(reg_storage, app_storage, users_manager, http_client)


# ── Tests: App CRUD ──────────────────────────────────────────────────────


class TestListApps:
    async def test_list_empty(self, apps_manager):
        result = await apps_manager.list_apps()
        assert result == []

    async def test_list_returns_all(self, apps_manager, app_storage):
        await app_storage.save(_make_app("app-1"))
        await app_storage.save(_make_app("app-2", user_id="user-2"))
        result = await apps_manager.list_apps()
        assert len(result) == 2


class TestGetApp:
    async def test_get_existing(self, apps_manager, app_storage):
        app = _make_app()
        await app_storage.save(app)
        fetched = await apps_manager.get_app("app-1")
        assert fetched.id == "app-1"
        assert fetched.name == "Test App"

    async def test_get_not_found(self, apps_manager):
        with pytest.raises(NotFoundError, match="App 'nonexistent' not found"):
            await apps_manager.get_app("nonexistent")


# ── Tests: Enable / Disable ─────────────────────────────────────────────


class TestEnableApp:
    async def test_enable_calls_app_and_unblocks_user(
        self, apps_manager, app_storage, http_client, users_manager
    ):
        await app_storage.save(_make_app())
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
        await app_storage.save(_make_app())
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
        await app_storage.save(_make_app())
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
        await app_storage.save(_make_app())
        http_client.post.side_effect = httpx.ConnectError("unreachable")
        result = await apps_manager.disable_app("app-1")
        assert result.id == "app-1"
        users_manager.block_user.assert_called_once_with("user-1")

    async def test_disable_not_found(self, apps_manager):
        with pytest.raises(NotFoundError):
            await apps_manager.disable_app("nonexistent")


# ── Tests: Health monitoring ─────────────────────────────────────────────


class TestHealthCheck:
    async def test_healthy_app(self, apps_manager, app_storage, http_client):
        await app_storage.save(_make_app(status=AppStatus.REGISTERED))
        response = AsyncMock()
        response.is_success = True
        http_client.get.return_value = response

        await apps_manager._check_all_apps_health()

        http_client.get.assert_called_once_with(
            "https://myapp.example.com/health", timeout=5.0
        )
        updated = await app_storage.get_by_id("app-1")
        assert updated is not None
        assert updated.status == AppStatus.HEALTHY

    async def test_unhealthy_app_bad_status(
        self, apps_manager, app_storage, http_client
    ):
        await app_storage.save(_make_app(status=AppStatus.HEALTHY))
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
        await app_storage.save(_make_app(status=AppStatus.HEALTHY))
        http_client.get.side_effect = httpx.ConnectError("unreachable")

        await apps_manager._check_all_apps_health()

        updated = await app_storage.get_by_id("app-1")
        assert updated is not None
        assert updated.status == AppStatus.UNHEALTHY

    async def test_no_update_when_status_unchanged(
        self, apps_manager, app_storage, http_client
    ):
        await app_storage.save(_make_app(status=AppStatus.HEALTHY))
        response = AsyncMock()
        response.is_success = True
        http_client.get.return_value = response

        # Spy on save to verify it's not called when status doesn't change
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


class TestAppHealthUrl:
    async def test_health_url_property(self):
        app = _make_app()
        assert app.health_url == "https://myapp.example.com/health"

    async def test_health_url_strips_trailing_slash(self):
        app = App(
            id="x",
            user_id="u",
            name="n",
            description="d",
            api_url="https://example.com/",
            icon="i",
        )
        assert app.health_url == "https://example.com/health"
