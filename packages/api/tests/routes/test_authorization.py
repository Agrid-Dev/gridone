"""Tests that RBAC permissions are enforced on API endpoints."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from apps import App, AppStatus, RegistrationRequest, RegistrationRequestStatus
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from api.dependencies import (
    get_apps_service,
    get_assets_manager,
    get_commands_service,
    get_current_user_id,
    get_device_manager,
    get_ts_service,
    get_users_manager,
)
from api.routes.apps import apps_registration_router
from api.routes.assets_router import router as assets_router
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
    dm = MagicMock()
    dm.list_active_faults.return_value = []
    app.dependency_overrides[get_users_manager] = lambda: manager
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_ts_service] = lambda: AsyncMock()
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(devices_router, prefix="/devices", dependencies=jwt_dep)
    return app


@pytest.fixture
def devices_app() -> FastAPI:
    return _build_devices_app()


DEVICES_ACCESS_CONTROL_SCENARIOS = [
    pytest.param(
        "POST", "/devices/any-id/timeseries", "viewer", 403, id="bulk-push-viewer"
    ),
    pytest.param(
        "POST", "/devices/any-id/timeseries", None, 401, id="bulk-push-unauthenticated"
    ),
    pytest.param(
        "POST",
        "/devices/any-id/timeseries/attr",
        "viewer",
        403,
        id="single-push-viewer",
    ),
    pytest.param(
        "POST",
        "/devices/any-id/timeseries/attr",
        None,
        401,
        id="single-push-unauthenticated",
    ),
    # Timeseries read endpoints (viewer has TIMESERIES_READ)
    pytest.param(
        "GET", "/devices/any-id/timeseries", "viewer", 200, id="list-ts-viewer"
    ),
    pytest.param("GET", "/devices/any-id/timeseries", None, 401, id="list-ts-no-auth"),
    pytest.param(
        "GET",
        "/devices/any-id/timeseries/temp",
        "viewer",
        200,
        id="get-ts-points-viewer",
    ),
    pytest.param(
        "GET",
        "/devices/any-id/timeseries/temp",
        None,
        401,
        id="get-ts-points-no-auth",
    ),
    # Export requires series_ids; omitting it returns 422 (before auth on viewer, after auth on no-auth)
    pytest.param(
        "GET",
        "/devices/timeseries/export/csv",
        "viewer",
        422,
        id="export-csv-viewer",
    ),
    pytest.param(
        "GET",
        "/devices/timeseries/export/csv",
        None,
        401,
        id="export-csv-no-auth",
    ),
    # Faults read endpoint (nested under /devices/faults, all auth roles allowed)
    pytest.param("GET", "/devices/faults/", "admin", 200, id="faults-admin"),
    pytest.param("GET", "/devices/faults/", "operator", 200, id="faults-operator"),
    pytest.param("GET", "/devices/faults/", "viewer", 200, id="faults-viewer"),
    pytest.param("GET", "/devices/faults/", None, 401, id="faults-no-auth"),
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


# --- Commands and asset-command RBAC ---


def _build_commands_app() -> FastAPI:
    """App with the devices_router and assets_router mounted.

    Used to verify that the permission decorators on the command endpoints
    reject viewers and unauthenticated requests before any service is invoked.
    """
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersManager()
    app.dependency_overrides[get_users_manager] = lambda: manager
    app.dependency_overrides[get_device_manager] = lambda: MagicMock()
    app.dependency_overrides[get_ts_service] = lambda: AsyncMock()
    app.dependency_overrides[get_assets_manager] = lambda: MagicMock()
    app.dependency_overrides[get_commands_service] = lambda: AsyncMock()
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(devices_router, prefix="/devices", dependencies=jwt_dep)
    app.include_router(assets_router, prefix="/assets", dependencies=jwt_dep)
    return app


@pytest.fixture
def commands_app() -> FastAPI:
    return _build_commands_app()


COMMANDS_ACCESS_CONTROL_SCENARIOS = [
    # Viewer is forbidden from any device-write endpoint.
    pytest.param(
        "POST",
        "/devices/commands",
        "viewer",
        403,
        {"device_ids": ["x"], "attribute": "a", "value": 1},
        id="batch-cmd-viewer",
    ),
    pytest.param(
        "POST",
        "/devices/commands",
        None,
        401,
        {"device_ids": ["x"], "attribute": "a", "value": 1},
        id="batch-cmd-no-auth",
    ),
    pytest.param(
        "POST",
        "/devices/any-id/commands",
        "viewer",
        403,
        {"attribute": "a", "value": 1},
        id="single-cmd-viewer",
    ),
    pytest.param(
        "POST",
        "/devices/any-id/commands",
        None,
        401,
        {"attribute": "a", "value": 1},
        id="single-cmd-no-auth",
    ),
    pytest.param(
        "POST",
        "/assets/any-id/commands",
        "viewer",
        403,
        {"attribute": "a", "value": 1, "device_type": "thermostat"},
        id="asset-cmd-viewer",
    ),
    pytest.param(
        "POST",
        "/assets/any-id/commands",
        None,
        401,
        {"attribute": "a", "value": 1, "device_type": "thermostat"},
        id="asset-cmd-no-auth",
    ),
    # GET /devices/commands requires DEVICES_READ — all roles can read, but no-auth is 401.
    pytest.param("GET", "/devices/commands", None, 401, None, id="get-cmds-no-auth"),
    pytest.param(
        "GET",
        "/devices/any-id/commands",
        None,
        401,
        None,
        id="get-device-cmds-no-auth",
    ),
    # Command templates: viewer can READ, cannot WRITE; no-auth returns 401.
    pytest.param(
        "POST",
        "/devices/command-templates/",
        "viewer",
        403,
        {
            "target": {"ids": ["d1"]},
            "write": {
                "attribute": "mode",
                "value": "auto",
                "data_type": "str",
            },
        },
        id="create-template-viewer",
    ),
    pytest.param(
        "POST",
        "/devices/command-templates/",
        None,
        401,
        {
            "target": {"ids": ["d1"]},
            "write": {
                "attribute": "mode",
                "value": "auto",
                "data_type": "str",
            },
        },
        id="create-template-no-auth",
    ),
    pytest.param(
        "DELETE",
        "/devices/command-templates/any-id",
        "viewer",
        403,
        None,
        id="delete-template-viewer",
    ),
    pytest.param(
        "DELETE",
        "/devices/command-templates/any-id",
        None,
        401,
        None,
        id="delete-template-no-auth",
    ),
    pytest.param(
        "POST",
        "/devices/command-templates/any-id/dispatch",
        "viewer",
        403,
        None,
        id="dispatch-template-viewer",
    ),
    pytest.param(
        "POST",
        "/devices/command-templates/any-id/dispatch",
        None,
        401,
        None,
        id="dispatch-template-no-auth",
    ),
    pytest.param(
        "GET",
        "/devices/command-templates/",
        None,
        401,
        None,
        id="list-templates-no-auth",
    ),
    pytest.param(
        "GET",
        "/devices/command-templates/any-id",
        None,
        401,
        None,
        id="get-template-no-auth",
    ),
]


@pytest.mark.parametrize(
    ("method", "endpoint", "username", "expected_status", "body"),
    COMMANDS_ACCESS_CONTROL_SCENARIOS,
)
def test_commands_access_control(
    commands_app: FastAPI,
    method: str,
    endpoint: str,
    username: str | None,
    expected_status: int,
    body: dict | None,
) -> None:
    with TestClient(commands_app) as client:
        headers: dict[str, str] = {}
        if username is not None:
            token = _login(client, username)
            headers = _auth_header(token)
        resp = client.request(method, endpoint, headers=headers, json=body)
        assert resp.status_code == expected_status
