"""Shared fixtures for apps unit tests."""

from unittest.mock import AsyncMock

import httpx
import pytest

from apps.models import App, AppStatus
from apps.storage.memory import MemoryAppStorage, MemoryRegistrationStorage
from users import UsersServiceInterface
from users.models import User, UserType

VALID_CONFIG = (
    "name: My App\n"
    "api_url: https://example.com\n"
    "description: A test application\n"
    "icon: https://example.com/icon.png\n"
    "produces: [weather_sensor]\n"
    "reads:\n"
    "  thermostat: [temperature]\n"
    "commands:\n"
    "  thermostat: [temperature_setpoint]\n"
)


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


def make_user(user_id: str = "user-1", *, is_blocked: bool = False) -> User:
    return User(
        id=user_id,
        username=f"app-{user_id}",
        type=UserType.SERVICE_ACCOUNT,
        is_blocked=is_blocked,
    )


@pytest.fixture
def reg_storage() -> MemoryRegistrationStorage:
    return MemoryRegistrationStorage()


@pytest.fixture
def app_storage() -> MemoryAppStorage:
    return MemoryAppStorage()


@pytest.fixture
def users_manager() -> AsyncMock:
    mock = AsyncMock(spec=UsersServiceInterface)
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
    # Reads behind `App.enabled`: default to "nothing is blocked", so a test
    # that does not care about the enabled state gets a coherent one rather
    # than an AsyncMock (truthy, and not iterable).
    mock.list_users.return_value = []
    mock.is_blocked.return_value = False
    return mock


def health_response(
    status_code: int = 200, body: object | None = None
) -> httpx.Response:
    """Build a real `/health` reply, with `body` serialized as JSON.

    Health probes read the body, and `httpx.Response.json()` is sync — an
    `AsyncMock` stand-in would hand back a coroutine instead. Omitting `body`
    yields the "2xx without JSON" compatibility case.
    """
    if body is None:
        return httpx.Response(status_code)
    return httpx.Response(status_code, json=body)


@pytest.fixture
def http_client() -> AsyncMock:
    mock = AsyncMock(spec=httpx.AsyncClient)
    mock.aclose = AsyncMock()
    response = AsyncMock()
    response.is_success = True
    mock.post.return_value = response
    mock.get.return_value = health_response()
    return mock
