"""Tests that RBAC permissions are enforced on API endpoints."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from apps import App, AppStatus, RegistrationRequest, RegistrationRequestStatus
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from api.dependencies import (
    get_apps_service,
    get_current_user_id,
    get_device_manager,
    get_users_manager,
)
from api.routes.apps import apps_registration_router
from api.routes.devices_router import router as devices_router
from api.routes.users.auth_router import router as auth_router
from api.routes.users.users_router import router as users_router
from users import Role, User
from users.auth import AuthService


class MockUsersManager:
    """Shared mock for auth + users routers."""

    def __init__(self) -> None:
        self._credentials = {
            "admin": "admin",
            "operator": "operator",
            "viewer": "viewer",
        }
        self._users = {
            "admin": User(
                id="admin-id", username="admin", role=Role.ADMIN, name="Alice Admin"
            ),
            "operator": User(
                id="operator-id",
                username="operator",
                role=Role.OPERATOR,
                name="Bob Operator",
            ),
            "viewer": User(
                id="viewer-id",
                username="viewer",
                role=Role.VIEWER,
                name="Charlie Viewer",
            ),
        }

    async def authenticate(self, username: str, password: str) -> User | None:
        if self._credentials.get(username) != password:
            return None
        return self._users.get(username)

    async def get_by_id(self, user_id: str) -> User:
        for user in self._users.values():
            if user.id == user_id:
                return user
        msg = f"User '{user_id}' not found"
        raise RuntimeError(msg)

    async def list_users(self) -> list[User]:
        return list(self._users.values())

    async def is_blocked(self, user_id: str) -> bool:
        for user in self._users.values():
            if user.id == user_id:
                return user.is_blocked
        return False


def _build_apps_service_mock() -> AsyncMock:
    dummy_req = RegistrationRequest(
        id="req-1",
        username="app",
        hashed_password="x",
        status=RegistrationRequestStatus.ACCEPTED,
        created_at=datetime.now(UTC),
        config="name: x\napi_url: http://x\n",
    )
    dummy_user = User(id="u-1", username="app")
    dummy_app = App(
        id="app-1",
        user_id="u-1",
        name="x",
        description="",
        api_url="http://x",
        icon="",
        status=AppStatus.REGISTERED,
        manifest=dummy_req.config,
    )
    reg = AsyncMock()
    reg.list_registration_requests = AsyncMock(return_value=[])
    reg.accept_registration_request = AsyncMock(
        return_value=(dummy_req, dummy_user, dummy_app)
    )
    reg.discard_registration_request = AsyncMock(return_value=dummy_req)
    service = AsyncMock()
    service.registration = reg
    return service


def _build_app() -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersManager()
    app.dependency_overrides[get_users_manager] = lambda: manager
    app.dependency_overrides[get_apps_service] = lambda: _build_apps_service_mock()
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(users_router, prefix="/users", dependencies=jwt_dep)
    app.include_router(apps_registration_router, prefix="/apps")
    return app


@pytest.fixture
def app() -> FastAPI:
    return _build_app()


def _login(client: TestClient, username: str) -> str:
    """Login and return the access token."""
    resp = client.post(
        "/auth/login",
        data={"grant_type": "password", "username": username, "password": username},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- Admin can access user endpoints ---


def test_admin_can_list_users(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.get("/users/", headers=_auth_header(token))
        assert resp.status_code == 200
        assert len(resp.json()) == 3


def test_admin_me_has_all_permissions(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.get("/auth/me", headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "admin"
        assert "users:read" in data["permissions"]
        assert "users:write" in data["permissions"]
        assert "devices:write" in data["permissions"]


# --- Operator cannot access user endpoints ---


def test_operator_cannot_list_users(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "operator")
        resp = client.get("/users/", headers=_auth_header(token))
        assert resp.status_code == 403


def test_operator_me_has_no_user_permissions(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "operator")
        resp = client.get("/auth/me", headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "operator"
        assert "users:read" not in data["permissions"]
        assert "devices:write" in data["permissions"]


# --- Viewer cannot access write endpoints ---


def test_viewer_gets_basic_user_list(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "viewer")
        resp = client.get("/users/", headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3
        assert all(set(u.keys()) == {"id", "name"} for u in data)
        names = {u["name"] for u in data}
        assert "Alice A." in names
        assert "Bob O." in names


def test_viewer_me_has_read_only_permissions(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "viewer")
        resp = client.get("/auth/me", headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "viewer"
        assert "devices:read" in data["permissions"]
        assert "devices:write" not in data["permissions"]
        assert "users:read" not in data["permissions"]


# --- Unauthenticated request is 401 ---


def test_unauthenticated_returns_401(app: FastAPI) -> None:
    with TestClient(app) as client:
        resp = client.get("/users/")
        assert resp.status_code == 401


# --- Apps registration RBAC ---

ACCESS_CONTROL_SCENARIOS = [
    # (method, endpoint, username | None, expected_status)
    pytest.param("GET", "/apps/registration-requests", "admin", 200, id="admin-list"),
    pytest.param(
        "POST",
        "/apps/registration-requests/any-id/accept",
        "admin",
        200,
        id="admin-accept",
    ),
    pytest.param(
        "POST",
        "/apps/registration-requests/any-id/discard",
        "admin",
        200,
        id="admin-discard",
    ),
    pytest.param(
        "GET", "/apps/registration-requests", "operator", 403, id="operator-list"
    ),
    pytest.param(
        "POST",
        "/apps/registration-requests/any-id/accept",
        "operator",
        403,
        id="operator-accept",
    ),
    pytest.param(
        "POST",
        "/apps/registration-requests/any-id/discard",
        "operator",
        403,
        id="operator-discard",
    ),
    pytest.param(
        "GET", "/apps/registration-requests", None, 401, id="unauthenticated-list"
    ),
    pytest.param(
        "POST",
        "/apps/registration-requests/any-id/accept",
        None,
        401,
        id="unauthenticated-accept",
    ),
    pytest.param(
        "POST",
        "/apps/registration-requests/any-id/discard",
        None,
        401,
        id="unauthenticated-discard",
    ),
]


@pytest.mark.parametrize(
    ("method", "endpoint", "username", "expected_status"), ACCESS_CONTROL_SCENARIOS
)
def test_registration_access_control(
    app: FastAPI, method: str, endpoint: str, username: str | None, expected_status: int
) -> None:
    with TestClient(app) as client:
        headers = {}
        if username is not None:
            token = _login(client, username)
            headers = _auth_header(token)
        resp = client.request(method, endpoint, headers=headers)
        assert resp.status_code == expected_status


# --- Devices RBAC ---


def _build_devices_app() -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    app.state.websocket_manager = MagicMock(broadcast=AsyncMock())
    manager = MockUsersManager()
    app.dependency_overrides[get_users_manager] = lambda: manager
    app.dependency_overrides[get_device_manager] = lambda: AsyncMock()
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(devices_router, prefix="/devices", dependencies=jwt_dep)
    return app


@pytest.fixture
def devices_app() -> FastAPI:
    return _build_devices_app()


DEVICES_ACCESS_CONTROL_SCENARIOS = [
    pytest.param("PUT", "/devices/any-id/state", "viewer", 403, id="state-viewer"),
    pytest.param("PUT", "/devices/any-id/state", None, 401, id="state-unauthenticated"),
]


@pytest.mark.parametrize(
    ("method", "endpoint", "username", "expected_status"),
    DEVICES_ACCESS_CONTROL_SCENARIOS,
)
def test_devices_access_control(
    devices_app: FastAPI,
    method: str,
    endpoint: str,
    username: str | None,
    expected_status: int,
) -> None:
    with TestClient(devices_app) as client:
        headers = {}
        if username is not None:
            token = _login(client, username)
            headers = _auth_header(token)
        resp = client.request(method, endpoint, json={"values": {}}, headers=headers)
        assert resp.status_code == expected_status
