"""Shared fixtures for apps unit tests."""

from unittest.mock import AsyncMock

import httpx
import pytest
from apps.models import App, AppStatus, RegistrationRequest
from users.models import User, UserType

from users import UsersManagerInterface

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


def make_app(
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
