"""Unit tests for AppsManager registration, app management, and health checks."""

from unittest.mock import AsyncMock

import httpx
import pytest
from apps import AppsManager, RegistrationRequestCreate, RegistrationRequestStatus
from apps.models import App, AppStatus, RegistrationRequest
from models.errors import InvalidError, NotFoundError
from users import UsersManagerInterface
from users.models import User, UserType

pytestmark = pytest.mark.asyncio

VALID_CONFIG = (
    "name: My App\n"
    "api_url: https://example.com\n"
    "description: A test application\n"
    "icon: https://example.com/icon.png\n"
)


class InMemoryRegistrationStorage:
    """Minimal in-memory storage for registration requests."""

    def __init__(self) -> None:
        self._requests: dict[str, RegistrationRequest] = {}

    async def get_by_id(self, request_id: str) -> RegistrationRequest | None:
        return self._requests.get(request_id)

    async def list_all(self) -> list[RegistrationRequest]:
        return list(self._requests.values())

    async def save(self, request: RegistrationRequest) -> None:
        self._requests[request.id] = request

    async def close(self) -> None:
        pass


class InMemoryAppStorage:
    """Minimal in-memory storage for apps."""

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


@pytest.fixture
def reg_storage() -> InMemoryRegistrationStorage:
    return InMemoryRegistrationStorage()


@pytest.fixture
def app_storage() -> InMemoryAppStorage:
    return InMemoryAppStorage()


@pytest.fixture
def users_manager() -> AsyncMock:
    mock = AsyncMock(spec=UsersManagerInterface)
    mock.create_user.return_value = User(
        id="new-user-id",
        username="placeholder",
        type=UserType.SERVICE_ACCOUNT,
    )
    mock.block_user.return_value = User(
        id="user-1",
        username="app-user",
        type=UserType.SERVICE_ACCOUNT,
        is_blocked=True,
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
def apps_manager(
    reg_storage, app_storage, users_manager, http_client
) -> AppsManager:
    return AppsManager(reg_storage, app_storage, users_manager, http_client)


class TestCreateRegistrationRequest:
    async def test_create_request(self, apps_manager, reg_storage):
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="myapp",
                password="securepassword",
                config=VALID_CONFIG,
            )
        )
        assert req.username == "myapp"
        assert req.status == RegistrationRequestStatus.PENDING
        assert req.hashed_password != "securepassword"  # noqa: S105
        assert req.config == VALID_CONFIG
        stored = await reg_storage.get_by_id(req.id)
        assert stored is not None

    async def test_create_missing_config(self, apps_manager):
        with pytest.raises(InvalidError, match="config is required"):
            await apps_manager.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    config="",
                )
            )

    async def test_create_invalid_yaml(self, apps_manager):
        with pytest.raises(InvalidError, match="not valid YAML"):
            await apps_manager.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    config="[invalid: yaml: {",
                )
            )

    async def test_create_missing_required_fields(self, apps_manager):
        with pytest.raises(InvalidError, match="missing required fields"):
            await apps_manager.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    config="name: only name\n",
                )
            )

    async def test_create_not_a_mapping(self, apps_manager):
        with pytest.raises(InvalidError, match="must be a YAML mapping"):
            await apps_manager.create_registration_request(
                RegistrationRequestCreate(
                    username="myapp",
                    password="apppassword",
                    config="- just a list\n",
                )
            )


class TestListRegistrationRequests:
    async def test_list_empty(self, apps_manager):
        result = await apps_manager.list_registration_requests()
        assert result == []

    async def test_list_returns_all(self, apps_manager):
        await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="app2",
                password="password2",
                config=VALID_CONFIG,
            )
        )
        result = await apps_manager.list_registration_requests()
        assert len(result) == 2


class TestGetRegistrationRequest:
    async def test_get_existing(self, apps_manager):
        created = await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        fetched = await apps_manager.get_registration_request(created.id)
        assert fetched.id == created.id
        assert fetched.username == "app1"

    async def test_get_not_found(self, apps_manager):
        with pytest.raises(NotFoundError):
            await apps_manager.get_registration_request("nonexistent-id")


class TestAcceptRegistrationRequest:
    async def test_accept_creates_service_account_and_app(
        self, apps_manager, app_storage, users_manager
    ):
        users_manager.create_user.return_value = User(
            id="new-id",
            username="myapp",
            type=UserType.SERVICE_ACCOUNT,
        )
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="myapp",
                password="password123",
                config=VALID_CONFIG,
            )
        )

        accepted, user, app = await apps_manager.accept_registration_request(req.id)

        assert accepted.status == RegistrationRequestStatus.ACCEPTED
        assert user.username == "myapp"
        assert user.type == UserType.SERVICE_ACCOUNT
        assert app.user_id == "new-id"
        assert app.name == "My App"
        assert app.description == "A test application"
        assert app.api_url == "https://example.com"
        assert app.icon == "https://example.com/icon.png"
        assert app.health_url == "https://example.com/health"
        assert app.manifest == VALID_CONFIG

        stored = await app_storage.get_by_id(app.id)
        assert stored is not None

        users_manager.create_user.assert_called_once()
        call_args = users_manager.create_user.call_args
        assert call_args.args[0].username == "myapp"
        assert call_args.args[0].type == UserType.SERVICE_ACCOUNT
        assert call_args.kwargs["pre_hashed_password"] == req.hashed_password

    async def test_accept_not_found(self, apps_manager):
        with pytest.raises(NotFoundError):
            await apps_manager.accept_registration_request("nonexistent-id")

    async def test_accept_already_accepted(self, apps_manager):
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await apps_manager.accept_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await apps_manager.accept_registration_request(req.id)

    async def test_accept_already_discarded(self, apps_manager):
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await apps_manager.discard_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await apps_manager.accept_registration_request(req.id)

    async def test_accept_duplicate_username(self, apps_manager, users_manager):
        users_manager.create_user.side_effect = ValueError("already exists")

        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="taken",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        with pytest.raises(ValueError, match="already exists"):
            await apps_manager.accept_registration_request(req.id)


class TestDiscardRegistrationRequest:
    async def test_discard(self, apps_manager):
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        discarded = await apps_manager.discard_registration_request(req.id)
        assert discarded.status == RegistrationRequestStatus.DISCARDED

    async def test_discard_not_found(self, apps_manager):
        with pytest.raises(NotFoundError):
            await apps_manager.discard_registration_request("nonexistent-id")

    async def test_discard_already_accepted(self, apps_manager):
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await apps_manager.accept_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await apps_manager.discard_registration_request(req.id)

    async def test_discard_already_discarded(self, apps_manager):
        req = await apps_manager.create_registration_request(
            RegistrationRequestCreate(
                username="app1",
                password="password1",
                config=VALID_CONFIG,
            )
        )
        await apps_manager.discard_registration_request(req.id)
        with pytest.raises(InvalidError, match="not pending"):
            await apps_manager.discard_registration_request(req.id)


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
        await app_storage.save(_make_app())
        fetched = await apps_manager.get_app("app-1")
        assert fetched.id == "app-1"
        assert fetched.name == "Test App"

    async def test_get_not_found(self, apps_manager):
        with pytest.raises(NotFoundError, match="App 'nonexistent' not found"):
            await apps_manager.get_app("nonexistent")


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


class TestHealthCheck:
    async def test_healthy_app(self, apps_manager, app_storage, http_client):
        await app_storage.save(_make_app(status=AppStatus.REGISTERED))
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


class TestAppsManagerLifecycle:
    async def test_close_shuts_down_without_error(
        self, reg_storage, app_storage, users_manager
    ):
        manager = AppsManager(reg_storage, app_storage, users_manager)
        await manager.close()

    async def test_from_storage_rejects_non_postgres(self, users_manager):
        with pytest.raises(ValueError, match="requires PostgreSQL"):
            await AppsManager.from_storage("/data/not-postgres", users_manager)
