"""Tests that RBAC permissions are enforced on API endpoints."""

import inspect
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from automations import AutomationsServiceInterface
from dashboards import (
    Dashboard,
    DashboardsServiceInterface,
    Metadata,
    TextWidgetConfig,
    Widget,
    WidgetLayout,
)
from fastapi import Depends, FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from api.access.dependencies import get_device_reads, get_target_resolver
from api.app import create_app
from api.auth import get_current_user_id
from api.dependencies import (
    get_apps_service,
    get_assets_service,
    get_automations_service,
    get_building_models_service,
    get_commands_service,
    get_dashboards_service,
    get_device_manager,
    get_notifications_service,
    get_synoptics_service,
    get_ts_service,
    get_users_service,
)
from api.exception_handlers import register_exception_handlers
from api.routes.apps import apps_registration_router, apps_router
from api.routes.assets_router import router as assets_router
from api.routes.automations_router import router as automations_router
from api.routes.command_router import get_selection_commands
from api.routes.command_router import router as command_router
from api.routes.dashboards_router import router as dashboards_router
from api.routes.devices_router import router as devices_router
from api.routes.drivers_router import router as drivers_router
from api.routes.faults_router import router as faults_router
from api.routes.notifications_router import router as notifications_router
from api.routes.operating_rules_router import (
    get_operating_rules_service,
)
from api.routes.operating_rules_router import (
    router as operating_rules_router,
)
from api.routes.presentations_router import router as presentations_router
from api.routes.synoptics_router import router as synoptics_router
from api.routes.transports_router import ingress_router as transports_ingress_router
from api.routes.transports_router import router as transports_router
from api.routes.users.auth_router import router as auth_router
from api.routes.users.roles_router import router as roles_router
from api.routes.users.users_router import router as users_router
from api.selection_commands import SelectionCommands
from apps import (
    App,
    AppsService,
    AppStatus,
    RegistrationRequest,
    RegistrationRequestStatus,
)
from commands import (
    AttributeWrite,
    BatchCommandDispatch,
    CommandsServiceInterface,
    CommandStatus,
    CommandTemplate,
    UnitCommand,
)
from devices_manager import (
    DevicesServiceInterface,
    DiscoveryManagerInterface,
    IngressResult,
)
from devices_manager.core.device import Attribute
from devices_manager.core.device.connection_status import AttributeLogs
from devices_manager.core.presentation.resources import StoredResource
from devices_manager.dto import FaultView
from devices_manager.dto.device_dto import Device
from devices_manager.dto.presentation_dto import UnavailablePresentationResponse
from devices_manager.types import DataType
from models.errors import NotFoundError
from models.metadata import ResourceMetadata
from models.operating_rules import OperatingRule
from models.pagination import Page
from models.targets import DevicesFilter, ResolvedTarget
from models.types import Severity
from notifications import (
    Notification,
    NotificationDispatch,
    NotificationsServiceInterface,
)
from operating_rules import OperatingRulesService
from synoptics import Synoptic, SynopticsServiceInterface
from timeseries.domain import FetchPointsResult
from users import DeviceScope, DeviceSelector, Role, RoleCreate, RoleUpdate, User
from users.auth import AuthService
from users.permissions import Permission
from users.roles import BUILTIN_ROLES, find_builtin_role

INTEGRATION_ROLE = Role(
    id="integration",
    name="Integration",
    # Everything except user and role management, per AGR-1118.
    permissions=[
        p
        for p in Permission
        if not p.startswith("users:") and p is not Permission.ROLES_WRITE
    ],
)


# Reads thermostats only: the scope scenarios at the end of this file.
THERMOSTAT_READER_ROLE = Role(
    id="thermostat_reader",
    name="Thermostat reader",
    permissions=[
        Permission.DEVICES_READ,
        Permission.DEVICES_LOGS_READ,
        Permission.TIMESERIES_READ,
    ],
    scopes={
        Permission.DEVICES_READ: [
            DeviceScope(devices=DeviceSelector(types=["thermostat"]))
        ]
    },
)
CUSTOM_ROLES = {r.id: r for r in (INTEGRATION_ROLE, THERMOSTAT_READER_ROLE)}


class MockUsersService:
    """Shared mock for auth + users routers."""

    def __init__(self) -> None:
        self._credentials = {
            "admin": "admin",
            "operator": "operator",
            "viewer": "viewer",
            "integrator": "integrator",
            "reader": "reader",
        }
        self._users = {
            "admin": User(
                id="admin-id", username="admin", role="admin", name="Alice Admin"
            ),
            "operator": User(
                id="operator-id",
                username="operator",
                role="operator",
                name="Bob Operator",
            ),
            "viewer": User(
                id="viewer-id",
                username="viewer",
                role="viewer",
                name="Charlie Viewer",
            ),
            # Holds a custom role: everything except user and role management.
            "integrator": User(
                id="integrator-id",
                username="integrator",
                role=INTEGRATION_ROLE.id,
                name="Dana Integrator",
            ),
            "reader": User(
                id="reader-id",
                username="reader",
                role=THERMOSTAT_READER_ROLE.id,
                name="Eve Reader",
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
        raise NotFoundError(msg)

    async def list_users(self) -> list[User]:
        return list(self._users.values())

    async def list_roles(self) -> list[Role]:
        return [*BUILTIN_ROLES, *CUSTOM_ROLES.values()]

    async def find_role(self, role_id: str) -> Role | None:
        return CUSTOM_ROLES.get(role_id) or find_builtin_role(role_id)

    async def get_role_permissions(self, role_id: str) -> list[Permission]:
        role = await self.find_role(role_id)
        return list(role.permissions) if role is not None else []

    # The write routes only need to exist here: what they do is the roles
    # router test's business, who may call them is this file's.
    async def create_role(self, create_data: RoleCreate) -> Role:
        return create_data.to_role()

    async def update_role(self, role_id: str, update_data: RoleUpdate) -> Role:
        return update_data.apply_to(INTEGRATION_ROLE.model_copy(update={"id": role_id}))

    async def delete_role(self, role_id: str) -> None:
        self._deleted_role = role_id

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
    service = AsyncMock()
    service.list_registration_requests = AsyncMock(return_value=[])
    service.accept_registration_request = AsyncMock(
        return_value=(dummy_req, dummy_user, dummy_app)
    )
    service.discard_registration_request = AsyncMock(return_value=dummy_req)
    return service


def _build_app() -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersService()
    app.dependency_overrides[get_users_service] = lambda: manager
    app.dependency_overrides[get_apps_service] = _build_apps_service_mock
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(roles_router, prefix="/users/roles", dependencies=jwt_dep)
    app.include_router(users_router, prefix="/users", dependencies=jwt_dep)
    app.include_router(apps_registration_router, prefix="/apps")
    return app


@pytest.fixture
def app() -> FastAPI:
    return _build_app()


def _login(client: TestClient, username: str) -> str:
    """Login and return the access token."""
    resp = client.post(
        "/auth/token",
        data={"grant_type": "password", "username": username, "password": username},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("username", ["admin", "operator", "viewer", None])
@pytest.mark.parametrize(
    ("method", "endpoint", "write"),
    [
        ("GET", "/operating-rules/", False),
        ("GET", "/operating-rules/schema", False),
        ("GET", "/operating-rules/rule", False),
        ("GET", "/operating-rules/rule/history", False),
        ("POST", "/operating-rules/", True),
        ("PUT", "/operating-rules/rule", True),
        ("POST", "/operating-rules/rule/retire", True),
        ("PATCH", "/operating-rules/rule/enabled", True),
        ("DELETE", "/operating-rules/rule?revision=1", True),
    ],
)
def test_operating_rules_access_control(app, username, method, endpoint, write):
    now = datetime.now(UTC)
    definition = {
        "name": "Interlock",
        "explanation": "Separate equipment",
        "target": {"device_id": "a", "attribute": "command", "value": True},
        "condition": {
            "op": "eq",
            "left": {"device_id": "b", "attribute": "running"},
            "right": False,
        },
    }
    rule = OperatingRule.model_validate(
        {
            **definition,
            "id": "rule",
            "attributes": [],
            "created_at": now,
            "updated_at": now,
            "created_by": "admin",
            "updated_by": "admin",
        }
    )
    svc = AsyncMock(spec=OperatingRulesService)
    svc.list_operating_rules.return_value = []
    svc.get.return_value = rule
    svc.diagnose.return_value = []
    svc.history.return_value = [rule]
    svc.create.return_value = svc.update.return_value = svc.retire.return_value = rule
    svc.set_enabled.return_value = rule
    app.dependency_overrides[get_operating_rules_service] = lambda: svc
    app.include_router(
        operating_rules_router,
        prefix="/operating-rules",
        dependencies=[Depends(get_current_user_id)],
    )
    body = (
        {"revision": 1, "enabled": False}
        if method == "PATCH"
        else {"revision": 1, "reason": "Equipment removed"}
        if endpoint.endswith("/retire")
        else {**definition, **({"revision": 1} if method == "PUT" else {})}
    )
    with TestClient(app) as client:
        headers = _auth_header(_login(client, username)) if username else {}
        response = client.request(method, endpoint, headers=headers, json=body)
    expected = (
        401
        if username is None
        else 403
        if write and username != "admin"
        else 201
        if method == "POST" and endpoint == "/operating-rules/"
        else 204
        if method == "DELETE"
        else 200
    )
    assert response.status_code == expected, response.text


# --- Admin can access user endpoints ---


def test_admin_can_list_users(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.get("/users/", headers=_auth_header(token))
        assert resp.status_code == 200
        assert len(resp.json()) == 5


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
        assert "devices:command" in data["permissions"]


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
        assert "devices:command" in data["permissions"]


# --- Viewer cannot access write endpoints ---


def test_viewer_gets_basic_user_list(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "viewer")
        resp = client.get("/users/", headers=_auth_header(token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 5
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
        assert "devices:command" not in data["permissions"]
        assert "users:read" not in data["permissions"]


# --- Every built-in role can read roles ---


@pytest.mark.parametrize("username", ["admin", "operator", "viewer"])
def test_every_role_can_list_roles(app: FastAPI, username: str) -> None:
    with TestClient(app) as client:
        token = _login(client, username)
        resp = client.get("/users/roles/", headers=_auth_header(token))
        assert resp.status_code == 200
        assert [r["id"] for r in resp.json()] == [
            "admin",
            "operator",
            "viewer",
            "integration",
            "thermostat_reader",
        ]


def test_list_roles_unauthenticated_returns_401(app: FastAPI) -> None:
    with TestClient(app) as client:
        assert client.get("/users/roles/").status_code == 401


# --- Only admin writes roles ---

ROLE_BODIES = {
    "POST": {
        "id": "night_shift",
        "name": "Night shift",
        "permissions": ["devices:read"],
    },
    "PATCH": {"name": "Night shift"},
    "DELETE": None,
}

ROLES_WRITE_SCENARIOS = [
    pytest.param("POST", "/users/roles/", "admin", 201, id="create-admin"),
    pytest.param("POST", "/users/roles/", "operator", 403, id="create-operator"),
    pytest.param("POST", "/users/roles/", "integrator", 403, id="create-custom"),
    pytest.param("POST", "/users/roles/", None, 401, id="create-no-auth"),
    pytest.param("PATCH", "/users/roles/x", "admin", 200, id="update-admin"),
    pytest.param("PATCH", "/users/roles/x", "viewer", 403, id="update-viewer"),
    pytest.param("DELETE", "/users/roles/x", "admin", 204, id="delete-admin"),
    pytest.param("DELETE", "/users/roles/x", "operator", 403, id="delete-operator"),
]


@pytest.mark.parametrize(
    ("method", "path", "username", "expected"), ROLES_WRITE_SCENARIOS
)
def test_roles_write_requires_roles_write(
    app: FastAPI, method: str, path: str, username: str | None, expected: int
) -> None:
    with TestClient(app) as client:
        headers = _auth_header(_login(client, username)) if username else {}
        resp = client.request(method, path, json=ROLE_BODIES[method], headers=headers)
        assert resp.status_code == expected


# --- A custom role is resolved from the service, not from the built-in table ---


def test_custom_role_permissions_gate_requests(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "integrator")
        assert client.get("/users/", headers=_auth_header(token)).status_code == 403
        assert (
            client.get("/users/roles/", headers=_auth_header(token)).status_code == 200
        )
        me = client.get("/auth/me", headers=_auth_header(token)).json()
        assert me["role"] == "integration"
        assert "users:read" not in me["permissions"]
        assert "devices:command" in me["permissions"]


# --- Unauthenticated request is 401 ---


def test_unauthenticated_returns_401(app: FastAPI) -> None:
    with TestClient(app) as client:
        resp = client.get("/users/")
        assert resp.status_code == 401


# --- Apps registration RBAC ---

ACCESS_CONTROL_SCENARIOS = [
    # columns: method, endpoint, username (or None), expected_status
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


# --- Apps config/enable/disable RBAC (users:write gated) ---

_APPS_ROUTER_APP = App(
    id="app-1",
    user_id="u-1",
    name="x",
    description="",
    api_url="http://x",
    icon="",
    status=AppStatus.REGISTERED,
    manifest="",
)


def _build_apps_router_mock() -> AsyncMock:
    svc = AsyncMock(spec=AppsService)
    svc.get_config_schema.return_value = {"type": "object", "properties": {}}
    svc.get_config.return_value = {}
    svc.update_config.return_value = _APPS_ROUTER_APP
    svc.enable_app.return_value = _APPS_ROUTER_APP
    svc.disable_app.return_value = _APPS_ROUTER_APP
    return svc


def _build_apps_router_app() -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersService()
    app.dependency_overrides[get_users_service] = lambda: manager
    app.dependency_overrides[get_apps_service] = _build_apps_router_mock
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(apps_router, prefix="/apps", dependencies=jwt_dep)
    return app


@pytest.fixture
def apps_router_app() -> FastAPI:
    return _build_apps_router_app()


APPS_ROUTER_ACCESS_CONTROL_SCENARIOS = [
    pytest.param(
        "GET", "/apps/app-1/config/schema", "admin", 200, id="config-schema-admin"
    ),
    pytest.param(
        "GET",
        "/apps/app-1/config/schema",
        "operator",
        403,
        id="config-schema-operator",
    ),
    pytest.param(
        "GET", "/apps/app-1/config/schema", None, 401, id="config-schema-no-auth"
    ),
    pytest.param("GET", "/apps/app-1/config", "admin", 200, id="get-config-admin"),
    pytest.param(
        "GET", "/apps/app-1/config", "operator", 403, id="get-config-operator"
    ),
    pytest.param("GET", "/apps/app-1/config", None, 401, id="get-config-no-auth"),
    pytest.param("PATCH", "/apps/app-1/config", "admin", 200, id="patch-config-admin"),
    pytest.param(
        "PATCH", "/apps/app-1/config", "operator", 403, id="patch-config-operator"
    ),
    pytest.param("PATCH", "/apps/app-1/config", None, 401, id="patch-config-no-auth"),
    pytest.param("POST", "/apps/app-1/enable", "admin", 200, id="enable-admin"),
    pytest.param("POST", "/apps/app-1/enable", "operator", 403, id="enable-operator"),
    pytest.param("POST", "/apps/app-1/enable", None, 401, id="enable-no-auth"),
    pytest.param("POST", "/apps/app-1/disable", "admin", 200, id="disable-admin"),
    pytest.param("POST", "/apps/app-1/disable", "operator", 403, id="disable-operator"),
    pytest.param("POST", "/apps/app-1/disable", None, 401, id="disable-no-auth"),
]


@pytest.mark.parametrize(
    ("method", "endpoint", "username", "expected_status"),
    APPS_ROUTER_ACCESS_CONTROL_SCENARIOS,
)
def test_apps_router_access_control(
    apps_router_app: FastAPI,
    method: str,
    endpoint: str,
    username: str | None,
    expected_status: int,
) -> None:
    with TestClient(apps_router_app) as client:
        headers: dict[str, str] = {}
        if username is not None:
            token = _login(client, username)
            headers = _auth_header(token)
        body = {"lat": 1} if method == "PATCH" else None
        resp = client.request(method, endpoint, headers=headers, json=body)
        assert resp.status_code == expected_status


# --- Devices RBAC ---


def _build_devices_app() -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    app.state.websocket_manager = MagicMock(broadcast=AsyncMock())
    manager = MockUsersService()
    dm = MagicMock()
    dm.get_device_presentation = AsyncMock(
        return_value=UnavailablePresentationResponse(revision="rev", diagnostics=[])
    )
    dm.get_device_presentation_asset = AsyncMock(
        return_value=StoredResource(b"image", "image/png", "digest", 1, 1)
    )
    dm.list_devices.return_value = []
    dm.list_active_faults.return_value = []
    dm.get_attribute_logs.return_value = AttributeLogs(read=[], write=[], listen=[])
    dm.refresh_device_attribute = AsyncMock(
        return_value=Attribute.create(
            "temperature", DataType.FLOAT, {"read"}, value=23.5
        )
    )
    app.dependency_overrides[get_users_service] = lambda: manager
    app.dependency_overrides[get_device_manager] = lambda: dm
    ts_mock = AsyncMock(default_timezone="UTC")
    ts_mock.fetch_points.return_value = FetchPointsResult(
        points=[], truncated=False, next_start=None
    )
    app.dependency_overrides[get_ts_service] = lambda: ts_mock
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(devices_router, prefix="/devices", dependencies=jwt_dep)
    app.include_router(
        presentations_router, prefix="/presentations", dependencies=jwt_dep
    )
    return app


@pytest.fixture
def devices_app() -> FastAPI:
    return _build_devices_app()


DEVICES_ACCESS_CONTROL_SCENARIOS = [
    *[
        pytest.param("GET", endpoint, role, 401 if role is None else 200)
        for endpoint in (
            "/devices/device/presentation?revision=rev",
            "/devices/device/presentation/assets/bezel?revision=rev",
            "/presentations/schema",
        )
        for role in (None, "viewer", "operator", "admin")
    ],
    pytest.param(
        "GET", "/devices/attributes", "viewer", 200, id="attr-coverage-viewer"
    ),
    pytest.param("GET", "/devices/attributes", None, 401, id="attr-coverage-no-auth"),
    pytest.param(
        "GET",
        "/devices/tag-groups?tag_key=floor",
        "viewer",
        200,
        id="tag-groups-viewer",
    ),
    pytest.param(
        "GET",
        "/devices/tag-groups?tag_key=floor",
        None,
        401,
        id="tag-groups-no-auth",
    ),
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
    # Export requires series_ids; omitting it returns 422
    # (before auth on viewer, after auth on no-auth)
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
    # Aggregate: missing required params → 422 past auth, 401 without auth
    pytest.param(
        "GET",
        "/devices/any-id/timeseries/temp/aggregate",
        "viewer",
        422,
        id="aggregate-viewer",
    ),
    pytest.param(
        "GET",
        "/devices/any-id/timeseries/temp/aggregate",
        None,
        401,
        id="aggregate-no-auth",
    ),
    # Space aggregate: missing required params → 422 past auth, 401 without auth
    pytest.param(
        "GET",
        "/devices/timeseries/aggregate",
        "viewer",
        422,
        id="space-aggregate-viewer",
    ),
    pytest.param(
        "GET",
        "/devices/timeseries/aggregate",
        None,
        401,
        id="space-aggregate-no-auth",
    ),
    # Faults read endpoint (nested under /devices/faults, all auth roles allowed)
    pytest.param("GET", "/devices/faults/", "admin", 200, id="faults-admin"),
    pytest.param("GET", "/devices/faults/", "operator", 200, id="faults-operator"),
    pytest.param("GET", "/devices/faults/", "viewer", 200, id="faults-viewer"),
    pytest.param("GET", "/devices/faults/", None, 401, id="faults-no-auth"),
    # Attribute logs — admin only
    pytest.param(
        "GET", "/devices/any-id/temperature/logs", "admin", 200, id="logs-admin"
    ),
    pytest.param(
        "GET", "/devices/any-id/temperature/logs", "operator", 403, id="logs-operator"
    ),
    pytest.param(
        "GET", "/devices/any-id/temperature/logs", "viewer", 403, id="logs-viewer"
    ),
    pytest.param(
        "GET", "/devices/any-id/temperature/logs", None, 401, id="logs-no-auth"
    ),
    pytest.param(
        "POST",
        "/devices/any-id/attributes/temperature/refresh",
        "admin",
        200,
        id="refresh-attribute-admin",
    ),
    pytest.param(
        "POST",
        "/devices/any-id/attributes/temperature/refresh",
        "operator",
        200,
        id="refresh-attribute-operator",
    ),
    pytest.param(
        "POST",
        "/devices/any-id/attributes/temperature/refresh",
        "viewer",
        200,
        id="refresh-attribute-viewer",
    ),
    pytest.param(
        "POST",
        "/devices/any-id/attributes/temperature/refresh",
        None,
        401,
        id="refresh-attribute-no-auth",
    ),
    # Bulk zone assignment — a device write, like the single-device tag it loops over
    pytest.param(
        "POST",
        "/devices/asset-assignments",
        "viewer",
        403,
        id="asset-assignments-viewer",
    ),
    pytest.param(
        "POST",
        "/devices/asset-assignments",
        None,
        401,
        id="asset-assignments-no-auth",
    ),
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


def _build_commands_service_mock() -> AsyncMock:
    now = datetime.now(UTC)
    write = AttributeWrite(attribute="mode", value="auto", data_type=DataType.STRING)
    unit = UnitCommand(
        id=1,
        batch_id="batch-1",
        template_id=None,
        device_id="d1",
        attribute=write.attribute,
        value=write.value,
        data_type=write.data_type,
        status=CommandStatus.PENDING,
        status_details=None,
        user_id="operator-id",
        created_at=now,
        executed_at=None,
        completed_at=None,
    )
    dispatch = BatchCommandDispatch(batch_id="batch-1", commands=[unit])
    template = CommandTemplate(
        id="t-1",
        target=DevicesFilter(ids=["d1"]),
        write=write,
        name="Template",
        created_at=now,
        created_by="operator-id",
    )
    svc = AsyncMock(spec=CommandsServiceInterface)
    svc.dispatch_unit.return_value = unit
    svc.dispatch_batch.return_value = dispatch
    svc.dispatch_template.return_value = dispatch
    svc.save_template.return_value = template
    svc.get_template.return_value = template
    svc.update_template.return_value = template
    return svc


def _build_target_resolver_mock() -> AsyncMock:
    resolver = AsyncMock()
    resolver.resolve.return_value = ResolvedTarget(
        attribute="mode",
        device_ids=["d1"],
        data_type=DataType.STRING,
        excluded_device_ids=[],
    )
    return resolver


def _build_commands_app() -> FastAPI:
    """App with the devices_router and assets_router mounted.

    Used to verify that the permission decorators on the command endpoints
    let admins and operators through, and reject viewers and unauthenticated
    requests before any service is invoked.
    """
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersService()
    dm = MagicMock()
    assets_svc = AsyncMock()
    app.dependency_overrides[get_users_service] = lambda: manager
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_target_resolver] = _build_target_resolver_mock
    app.dependency_overrides[get_ts_service] = lambda: AsyncMock(default_timezone="UTC")
    app.dependency_overrides[get_assets_service] = lambda: assets_svc
    app.dependency_overrides[get_building_models_service] = MagicMock
    app.dependency_overrides[get_commands_service] = _build_commands_service_mock
    app.dependency_overrides[get_selection_commands] = lambda: MagicMock(
        spec=SelectionCommands
    )
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(devices_router, prefix="/devices", dependencies=jwt_dep)
    app.include_router(assets_router, prefix="/assets", dependencies=jwt_dep)
    return app


@pytest.fixture
def commands_app() -> FastAPI:
    return _build_commands_app()


_BATCH_COMMAND_BODY = {"target": {"ids": ["d1"]}, "attribute": "mode", "value": "auto"}
_SINGLE_COMMAND_BODY = {"attribute": "mode", "value": "auto"}
_ASSET_COMMAND_BODY = {
    "attribute": "mode",
    "value": "auto",
    "device_type": "thermostat",
}
_TEMPLATE_BODY = {
    "target": {"ids": ["d1"]},
    "write": {"attribute": "mode", "value": "auto", "data_type": "str"},
}


def _command_scenarios(
    method: str, endpoint: str, body: dict | None, success: int, prefix: str
) -> list:
    """The four scenarios every ``devices:command`` endpoint must satisfy."""
    return [
        pytest.param(method, endpoint, "admin", success, body, id=f"{prefix}-admin"),
        pytest.param(method, endpoint, "operator", success, body, id=f"{prefix}-op"),
        pytest.param(method, endpoint, "viewer", 403, body, id=f"{prefix}-viewer"),
        pytest.param(method, endpoint, None, 401, body, id=f"{prefix}-no-auth"),
    ]


COMMANDS_ACCESS_CONTROL_SCENARIOS = [
    pytest.param(
        "POST",
        "/devices/any-id/commands/preview",
        "viewer",
        403,
        _SINGLE_COMMAND_BODY,
        id="preview-cmd-viewer",
    ),
    pytest.param(
        "POST",
        "/devices/any-id/commands/preview",
        None,
        401,
        _SINGLE_COMMAND_BODY,
        id="preview-cmd-no-auth",
    ),
    # Dispatch and templates are gated by devices:command: admin and operator
    # hold it, viewer does not.
    *_command_scenarios("POST", "/devices/commands", _BATCH_COMMAND_BODY, 202, "batch"),
    *_command_scenarios(
        "POST", "/devices/any-id/commands", _SINGLE_COMMAND_BODY, 200, "single"
    ),
    *_command_scenarios(
        "POST", "/assets/any-id/commands", _ASSET_COMMAND_BODY, 202, "asset-cmd"
    ),
    *_command_scenarios(
        "POST", "/devices/commands/templates/", _TEMPLATE_BODY, 201, "create-tpl"
    ),
    *_command_scenarios(
        "PATCH",
        "/devices/commands/templates/any-id",
        {"name": "Renamed"},
        200,
        "update-tpl",
    ),
    *_command_scenarios(
        "DELETE", "/devices/commands/templates/any-id", None, 204, "delete-tpl"
    ),
    *_command_scenarios(
        "POST",
        "/devices/commands/templates/any-id/dispatch",
        None,
        202,
        "dispatch-tpl",
    ),
    # PUT /assets/profile requires ASSETS_WRITE.
    pytest.param("PUT", "/assets/profile", "viewer", 403, {}, id="profile-put-viewer"),
    pytest.param("PUT", "/assets/profile", None, 401, {}, id="profile-put-no-auth"),
    # PATCH /assets/usage (batch classification) requires ASSETS_WRITE.
    pytest.param(
        "PATCH",
        "/assets/usage",
        "viewer",
        403,
        {"asset_ids": ["x"], "usage": "office"},
        id="usage-batch-viewer",
    ),
    pytest.param(
        "PATCH",
        "/assets/usage",
        None,
        401,
        {"asset_ids": ["x"], "usage": "office"},
        id="usage-batch-no-auth",
    ),
    # Building model endpoints: writes require ASSETS_WRITE; the permission
    # check rejects before body/multipart parsing, so a JSON body is enough.
    pytest.param("POST", "/assets/any-id/model", "viewer", 403, {}, id="model-up-v"),
    pytest.param("POST", "/assets/any-id/model", None, 401, {}, id="model-up-noa"),
    pytest.param(
        "POST",
        "/assets/any-id/model/regenerate",
        "viewer",
        403,
        {},
        id="model-regen-v",
    ),
    pytest.param(
        "POST",
        "/assets/any-id/model/regenerate",
        None,
        401,
        {},
        id="model-regen-noa",
    ),
    pytest.param("DELETE", "/assets/any-id/model", "viewer", 403, {}, id="model-del-v"),
    pytest.param("DELETE", "/assets/any-id/model", None, 401, {}, id="model-del-noa"),
    pytest.param(
        "POST",
        "/assets/any-id/model/import-tree",
        "viewer",
        403,
        {},
        id="model-import-v",
    ),
    pytest.param(
        "POST",
        "/assets/any-id/model/import-tree",
        None,
        401,
        {},
        id="model-import-noa",
    ),
    pytest.param("GET", "/assets/any-id/model", None, 401, {}, id="model-get-noa"),
    pytest.param(
        "GET", "/assets/any-id/model/scene.glb", None, 401, {}, id="model-scene-noa"
    ),
    pytest.param(
        "GET", "/assets/any-id/model/spaces", None, 401, {}, id="model-spaces-noa"
    ),
    # GET /devices/commands requires DEVICES_READ — all roles can read,
    # but no-auth is 401.
    pytest.param("GET", "/devices/commands", None, 401, None, id="get-cmds-no-auth"),
    pytest.param(
        "GET",
        "/devices/any-id/commands",
        None,
        401,
        None,
        id="get-device-cmds-no-auth",
    ),
    # Command templates: reading needs devices:read; no-auth returns 401.
    pytest.param(
        "GET",
        "/devices/commands/templates/",
        None,
        401,
        None,
        id="list-templates-no-auth",
    ),
    pytest.param(
        "GET",
        "/devices/commands/templates/any-id",
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
def test_commands_access_control(  # noqa: PLR0913 (parametrized test fixture + 5 params)
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


# --- Automations RBAC ---


def _build_automations_mock() -> AsyncMock:
    svc = AsyncMock(spec=AutomationsServiceInterface)
    svc.list.return_value = []
    svc.list_executions.return_value = []
    svc.list_diagnostics.return_value = []
    svc.list_trigger_schemas = MagicMock(return_value={})
    svc.list_action_schemas = MagicMock(return_value={})
    return svc


def _build_automations_app() -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersService()
    app.dependency_overrides[get_users_service] = lambda: manager
    app.dependency_overrides[get_automations_service] = _build_automations_mock
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(automations_router, prefix="/automations", dependencies=jwt_dep)
    return app


@pytest.fixture
def automations_app() -> FastAPI:
    return _build_automations_app()


AUTOMATIONS_ACCESS_CONTROL_SCENARIOS = [
    pytest.param(
        "GET", "/automations/any-id/diagnostics", "viewer", 200, id="diagnostics-viewer"
    ),
    pytest.param(
        "GET", "/automations/any-id/diagnostics", None, 401, id="diagnostics-no-auth"
    ),
    pytest.param("GET", "/automations/schema", "viewer", 200, id="schema-viewer"),
    pytest.param("GET", "/automations/schema", None, 401, id="schema-no-auth"),
    pytest.param(
        "POST", "/automations/any-id/suspend", "viewer", 403, id="suspend-viewer"
    ),
    pytest.param(
        "POST", "/automations/any-id/suspend", "operator", 403, id="suspend-operator"
    ),
    pytest.param(
        "POST", "/automations/any-id/suspend", None, 401, id="suspend-no-auth"
    ),
    # Read endpoints — all authenticated roles can access
    pytest.param("GET", "/automations/", "viewer", 200, id="list-viewer"),
    pytest.param("GET", "/automations/", "operator", 200, id="list-operator"),
    pytest.param("GET", "/automations/", None, 401, id="list-no-auth"),
    pytest.param("GET", "/automations/triggers", "viewer", 200, id="triggers-viewer"),
    pytest.param("GET", "/automations/triggers", None, 401, id="triggers-no-auth"),
    pytest.param("GET", "/automations/actions", "viewer", 200, id="actions-viewer"),
    pytest.param("GET", "/automations/actions", None, 401, id="actions-no-auth"),
    # Write endpoints — only admin; operator and viewer are forbidden
    pytest.param("POST", "/automations/", "operator", 403, id="create-operator"),
    pytest.param("POST", "/automations/", "viewer", 403, id="create-viewer"),
    pytest.param("POST", "/automations/", None, 401, id="create-no-auth"),
    pytest.param("PATCH", "/automations/any-id", "operator", 403, id="update-operator"),
    pytest.param("PATCH", "/automations/any-id", "viewer", 403, id="update-viewer"),
    pytest.param("PATCH", "/automations/any-id", None, 401, id="update-no-auth"),
    pytest.param(
        "DELETE", "/automations/any-id", "operator", 403, id="delete-operator"
    ),
    pytest.param("DELETE", "/automations/any-id", "viewer", 403, id="delete-viewer"),
    pytest.param("DELETE", "/automations/any-id", None, 401, id="delete-no-auth"),
    pytest.param(
        "POST", "/automations/any-id/enable", "viewer", 403, id="enable-viewer"
    ),
    pytest.param("POST", "/automations/any-id/enable", None, 401, id="enable-no-auth"),
    pytest.param(
        "POST", "/automations/any-id/disable", "viewer", 403, id="disable-viewer"
    ),
    pytest.param(
        "POST", "/automations/any-id/disable", None, 401, id="disable-no-auth"
    ),
]


@pytest.mark.parametrize(
    ("method", "endpoint", "username", "expected_status"),
    AUTOMATIONS_ACCESS_CONTROL_SCENARIOS,
)
def test_automations_access_control(
    automations_app: FastAPI,
    method: str,
    endpoint: str,
    username: str | None,
    expected_status: int,
) -> None:
    with TestClient(automations_app) as client:
        headers: dict[str, str] = {}
        if username is not None:
            token = _login(client, username)
            headers = _auth_header(token)
        resp = client.request(method, endpoint, headers=headers)
        assert resp.status_code == expected_status


# --- Notifications RBAC ---

_NOTIF_ID = "notif0000000001"
_NOW = datetime(2026, 1, 1, tzinfo=UTC)
_NOTIF = Notification(
    id=_NOTIF_ID,
    title="Alert",
    body="Something happened",
    severity=Severity.ALERT,
    correlation_id=None,
    created_by=None,
    created_at=_NOW,
)
_DISPATCH = NotificationDispatch(
    notification=_NOTIF,
    user_id="test-user",
    dispatched_at=_NOW,
    dismissed_at=None,
)
_EMPTY_PAGE: Page[NotificationDispatch] = Page(items=[], total=0, page=1, size=50)


def _build_notifications_app() -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersService()
    notifications_svc = AsyncMock(spec=NotificationsServiceInterface)
    notifications_svc.list_for_user.return_value = _EMPTY_PAGE
    notifications_svc.dismiss.return_value = _DISPATCH
    notifications_svc.dispatch.return_value = [_DISPATCH]
    app.dependency_overrides[get_users_service] = lambda: manager
    app.dependency_overrides[get_notifications_service] = lambda: notifications_svc
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(
        notifications_router, prefix="/notifications", dependencies=jwt_dep
    )
    return app


@pytest.fixture
def notifications_app() -> FastAPI:
    return _build_notifications_app()


NOTIFICATIONS_ACCESS_CONTROL_SCENARIOS = [
    # List — any authenticated user can read their own notifications
    pytest.param("GET", "/notifications/", "viewer", 200, id="list-viewer"),
    pytest.param("GET", "/notifications/", "operator", 200, id="list-operator"),
    pytest.param("GET", "/notifications/", None, 401, id="list-no-auth"),
    # Dismiss — any authenticated user can dismiss their own notification
    pytest.param(
        "POST",
        f"/notifications/{_NOTIF_ID}/dismiss",
        "viewer",
        200,
        id="dismiss-viewer",
    ),
    pytest.param(
        "POST", f"/notifications/{_NOTIF_ID}/dismiss", None, 401, id="dismiss-no-auth"
    ),
    # Dispatch — requires NOTIFICATIONS_WRITE; admin-only for now (deferred endpoint)
    pytest.param("POST", "/notifications/", "viewer", 403, id="dispatch-viewer"),
    pytest.param("POST", "/notifications/", None, 401, id="dispatch-no-auth"),
    pytest.param("POST", "/notifications/", "operator", 403, id="dispatch-operator"),
]

_DISPATCH_BODY = {
    "title": "Alert",
    "body": "Something happened",
    "severity": "alert",
    "user_ids": ["user-a"],
}


@pytest.mark.parametrize(
    ("method", "endpoint", "username", "expected_status"),
    NOTIFICATIONS_ACCESS_CONTROL_SCENARIOS,
)
def test_notifications_access_control(
    notifications_app: FastAPI,
    method: str,
    endpoint: str,
    username: str | None,
    expected_status: int,
) -> None:
    body = (
        _DISPATCH_BODY if endpoint == "/notifications/" and method == "POST" else None
    )
    with TestClient(notifications_app) as client:
        headers: dict[str, str] = {}
        if username is not None:
            token = _login(client, username)
            headers = _auth_header(token)
        resp = client.request(method, endpoint, headers=headers, json=body)
        assert resp.status_code == expected_status


def _build_drivers_app() -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersService()
    dm = MagicMock()
    dm.list_drivers.return_value = []
    dm.install_driver_package = AsyncMock(
        return_value={
            "id": "any-id",
            "transport": "http",
            "device_config": [],
            "attributes": [],
        }
    )
    dm.export_driver_package = AsyncMock(return_value=b"PK")
    dm.get_driver_presentation_response = AsyncMock(return_value=None)
    dm.add_driver = AsyncMock()
    dm.create_driver_attribute = AsyncMock()
    dm.patch_driver = AsyncMock()
    dm.patch_driver_attribute = AsyncMock()
    dm.delete_driver = AsyncMock()
    dm.delete_driver_attribute = AsyncMock()
    dm.rename_driver_attribute = AsyncMock()
    dm.list_devices.return_value = []
    app.dependency_overrides[get_users_service] = lambda: manager
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_ts_service] = AsyncMock
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(drivers_router, prefix="/drivers", dependencies=jwt_dep)
    return app


@pytest.fixture
def drivers_app() -> FastAPI:
    return _build_drivers_app()


DRIVERS_ACCESS_CONTROL_SCENARIOS = [
    *[
        pytest.param(
            method,
            path,
            role,
            expected,
            id=f"package-{method}-{path.rsplit('/', 1)[-1]}-{role}",
        )
        for method, path in [
            ("PUT", "/drivers/any-id/package"),
            ("GET", "/drivers/any-id/package"),
            ("GET", "/drivers/any-id/presentation"),
        ]
        for role, expected in [
            (None, 401),
            ("viewer", 403 if method == "PUT" else 200),
            ("operator", 200),
            ("admin", 200),
        ]
    ],
    # Read — viewer and operator both have DRIVERS_READ
    pytest.param("GET", "/drivers/", "viewer", 200, id="list-viewer"),
    pytest.param("GET", "/drivers/", "operator", 200, id="list-operator"),
    pytest.param("GET", "/drivers/", None, 401, id="list-no-auth"),
    # Write (DRIVERS_WRITE) — viewer is forbidden; operator and admin are allowed
    pytest.param("PUT", "/drivers/any-id", "viewer", 403, id="create-viewer"),
    pytest.param("PUT", "/drivers/any-id", None, 401, id="create-no-auth"),
    pytest.param("PATCH", "/drivers/any-id", "viewer", 403, id="patch-viewer"),
    pytest.param("PATCH", "/drivers/any-id", None, 401, id="patch-no-auth"),
    pytest.param(
        "PATCH",
        "/drivers/any-id/attributes/any-attr",
        "viewer",
        403,
        id="patch-attr-viewer",
    ),
    pytest.param(
        "PATCH",
        "/drivers/any-id/attributes/any-attr",
        None,
        401,
        id="patch-attr-no-auth",
    ),
    pytest.param(
        "PUT",
        "/drivers/any-id/attributes/any-attr",
        "viewer",
        403,
        id="create-attr-viewer",
    ),
    pytest.param(
        "PUT",
        "/drivers/any-id/attributes/any-attr",
        None,
        401,
        id="create-attr-no-auth",
    ),
    pytest.param("DELETE", "/drivers/any-id", "viewer", 403, id="delete-viewer"),
    pytest.param("DELETE", "/drivers/any-id", None, 401, id="delete-no-auth"),
    pytest.param(
        "DELETE",
        "/drivers/any-id/attributes/any-attr",
        "viewer",
        403,
        id="delete-attr-viewer",
    ),
    pytest.param(
        "DELETE",
        "/drivers/any-id/attributes/any-attr",
        None,
        401,
        id="delete-attr-no-auth",
    ),
    pytest.param(
        "POST",
        "/drivers/any-id/attributes/any-attr/rename",
        "viewer",
        403,
        id="rename-attr-viewer",
    ),
    pytest.param(
        "POST",
        "/drivers/any-id/attributes/any-attr/rename",
        None,
        401,
        id="rename-attr-no-auth",
    ),
]


@pytest.mark.parametrize(
    ("method", "endpoint", "username", "expected_status"),
    DRIVERS_ACCESS_CONTROL_SCENARIOS,
)
def test_drivers_access_control(
    drivers_app: FastAPI,
    method: str,
    endpoint: str,
    username: str | None,
    expected_status: int,
) -> None:
    with TestClient(drivers_app) as client:
        headers: dict[str, str] = {}
        if username is not None:
            token = _login(client, username)
            headers = _auth_header(token)
        resp = client.request(method, endpoint, headers=headers, json={})
        assert resp.status_code == expected_status


# --- Transports ingress (public, transport-level auth) ---


class _FakeIngressTarget:
    async def ingress(self, _request: object) -> IngressResult:
        return IngressResult(matched=0)


def _build_transports_app() -> FastAPI:
    """Mirror app.py's split: the transports router sits behind the blanket
    JWT dep while the ingress router is mounted publicly — pushes are
    authenticated by the transport itself, not by the API user flow."""
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersService()
    dm = MagicMock()
    dm.list_transports.return_value = []
    dm.get_transport_ingress.return_value = _FakeIngressTarget()
    # Discovery stubs: an allowed role must reach the handler, so register and
    # unregister are async — a bare MagicMock returns a non-awaitable, which
    # discovery_router turns into a 422 that reads exactly like a permission bug.
    dm.transport_ids = {"t1"}
    dm.driver_ids = {"d1"}
    dm.list_drivers.return_value = []
    dm.discovery_manager = MagicMock(spec=DiscoveryManagerInterface)
    dm.discovery_manager.register = AsyncMock()
    dm.discovery_manager.unregister = AsyncMock()
    app.dependency_overrides[get_users_service] = lambda: manager
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.include_router(auth_router, prefix="/auth")
    app.include_router(transports_ingress_router, prefix="/transports")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(transports_router, prefix="/transports", dependencies=jwt_dep)
    app.state.dm = dm
    return app


@pytest.fixture
def transports_app() -> FastAPI:
    return _build_transports_app()


_DISCOVERY = "/transports/t1/discovery/"
_DISCOVERY_ITEM = "/transports/t1/discovery/d1"
_DRIVER = {"driver_id": "d1"}

TRANSPORTS_ACCESS_CONTROL_SCENARIOS = [
    # The management surface requires a JWT.
    pytest.param("GET", "/transports/", None, {}, 401, id="list-no-auth"),
    pytest.param("GET", "/transports/", "viewer", {}, 200, id="list-viewer"),
    # Ingress bypasses the user-auth flow: no JWT needed (the transport
    # checks its own credentials and 401s through UnauthorizedError).
    pytest.param(
        "POST",
        "/transports/t1/ingress/room1/snapshot",
        None,
        {},
        200,
        id="ingress-no-auth",
    ),
    # Discovery is a transport-scoped surface, so it reuses the transport
    # permissions: a viewer may read the status, but registering a handler
    # subscribes on the transport and persists devices, so it needs write.
    pytest.param("GET", _DISCOVERY, None, {}, 401, id="discovery-list-no-auth"),
    pytest.param("GET", _DISCOVERY, "viewer", {}, 200, id="discovery-list-viewer"),
    pytest.param("POST", _DISCOVERY, None, _DRIVER, 401, id="discovery-create-no-auth"),
    pytest.param(
        "POST", _DISCOVERY, "viewer", _DRIVER, 403, id="discovery-create-viewer"
    ),
    pytest.param(
        "POST", _DISCOVERY, "operator", _DRIVER, 201, id="discovery-create-operator"
    ),
    pytest.param(
        "POST", _DISCOVERY, "admin", _DRIVER, 201, id="discovery-create-admin"
    ),
    pytest.param(
        "DELETE", _DISCOVERY_ITEM, None, {}, 401, id="discovery-delete-no-auth"
    ),
    pytest.param(
        "DELETE", _DISCOVERY_ITEM, "viewer", {}, 403, id="discovery-delete-viewer"
    ),
    pytest.param(
        "DELETE", _DISCOVERY_ITEM, "operator", {}, 204, id="discovery-delete-operator"
    ),
]


@pytest.mark.parametrize(
    ("method", "endpoint", "username", "body", "expected_status"),
    TRANSPORTS_ACCESS_CONTROL_SCENARIOS,
)
def test_transports_access_control(  # noqa: PLR0913
    transports_app: FastAPI,
    method: str,
    endpoint: str,
    username: str | None,
    body: dict,
    expected_status: int,
) -> None:
    with TestClient(transports_app) as client:
        headers: dict[str, str] = {}
        if username is not None:
            token = _login(client, username)
            headers = _auth_header(token)
        resp = client.request(method, endpoint, headers=headers, json=body)
        assert resp.status_code == expected_status


def test_discovery_write_denied_before_handler(transports_app: FastAPI) -> None:
    """A denied role must be stopped by the permission gate, not after the fact:
    a 403 that had already subscribed on the transport or dropped a handler
    would be a silent side effect."""
    discovery = transports_app.state.dm.discovery_manager
    with TestClient(transports_app) as client:
        headers = _auth_header(_login(client, "viewer"))
        assert client.post(_DISCOVERY, headers=headers, json=_DRIVER).status_code == 403
        assert client.delete(_DISCOVERY_ITEM, headers=headers).status_code == 403
    discovery.register.assert_not_called()
    discovery.unregister.assert_not_called()


# --- Dashboards RBAC ---
# Write endpoints allow admin + operator; viewer is read-only; no-auth is 401.

_DASH_META = Metadata()
_DASH_WIDGET = Widget(
    id="w1",
    config=TextWidgetConfig(text="hi", color="#1a2b3c"),
    layout=WidgetLayout(x=0, y=0, w=4, h=2),
    metadata=_DASH_META,
)
_DASH = Dashboard(id="d1", name="Ops", widgets=[_DASH_WIDGET], metadata=_DASH_META)


def _build_dashboards_mock() -> AsyncMock:
    svc = AsyncMock(spec=DashboardsServiceInterface)
    svc.list.return_value = Page(items=[], total=0, page=1, size=1)
    svc.create.return_value = _DASH
    svc.get.return_value = _DASH
    svc.update.return_value = _DASH
    svc.add_widget.return_value = _DASH_WIDGET
    svc.update_widget.return_value = _DASH_WIDGET
    svc.update_layout.return_value = _DASH
    svc.widget_schemas = MagicMock(return_value={"text": {}})
    return svc


def _build_dashboards_app() -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersService()
    app.dependency_overrides[get_users_service] = lambda: manager
    app.dependency_overrides[get_dashboards_service] = _build_dashboards_mock
    # Widget endpoints resolve targets at save time; the resolver depends on
    # the device manager, which this app doesn't carry.
    dm = MagicMock()
    dm.list_devices.return_value = []
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(dashboards_router, prefix="/dashboards", dependencies=jwt_dep)
    return app


@pytest.fixture
def dashboards_app() -> FastAPI:
    return _build_dashboards_app()


_CREATE_BODY = {"name": "Ops"}
_WIDGET_BODY = {"config": {"type": "text", "text": "hi", "color": "#1a2b3c"}}
_LAYOUT_BODY = [{"i": "w1", "x": 0, "y": 0, "w": 4, "h": 2}]

DASHBOARDS_ACCESS_CONTROL_SCENARIOS = [
    # Reads — every authenticated role can read; no-auth is 401.
    pytest.param("GET", "/dashboards/", "viewer", 200, None, id="list-viewer"),
    pytest.param("GET", "/dashboards/", "operator", 200, None, id="list-operator"),
    pytest.param("GET", "/dashboards/", None, 401, None, id="list-no-auth"),
    pytest.param(
        "GET", "/dashboards/widget-schemas", "viewer", 200, None, id="schemas-viewer"
    ),
    pytest.param(
        "GET", "/dashboards/widget-schemas", None, 401, None, id="schemas-no-auth"
    ),
    pytest.param("GET", "/dashboards/any-id", "viewer", 200, None, id="get-viewer"),
    pytest.param("GET", "/dashboards/any-id", None, 401, None, id="get-no-auth"),
    # Writes — admin + operator allowed; viewer 403; no-auth 401.
    pytest.param("POST", "/dashboards/", "operator", 201, _CREATE_BODY, id="create-op"),
    pytest.param(
        "POST", "/dashboards/", "viewer", 403, _CREATE_BODY, id="create-viewer"
    ),
    pytest.param("POST", "/dashboards/", None, 401, _CREATE_BODY, id="create-no-auth"),
    pytest.param(
        "PUT", "/dashboards/any-id", "operator", 200, _CREATE_BODY, id="update-op"
    ),
    pytest.param(
        "PUT", "/dashboards/any-id", "viewer", 403, _CREATE_BODY, id="update-viewer"
    ),
    pytest.param("PUT", "/dashboards/any-id", None, 401, _CREATE_BODY, id="update-noa"),
    pytest.param("DELETE", "/dashboards/any-id", "operator", 204, None, id="delete-op"),
    pytest.param(
        "DELETE", "/dashboards/any-id", "viewer", 403, None, id="delete-viewer"
    ),
    pytest.param("DELETE", "/dashboards/any-id", None, 401, None, id="delete-no-auth"),
    pytest.param(
        "POST",
        "/dashboards/any-id/widgets",
        "operator",
        201,
        _WIDGET_BODY,
        id="add-widget-op",
    ),
    pytest.param(
        "POST",
        "/dashboards/any-id/widgets",
        "viewer",
        403,
        _WIDGET_BODY,
        id="add-widget-viewer",
    ),
    pytest.param(
        "POST",
        "/dashboards/any-id/widgets",
        None,
        401,
        _WIDGET_BODY,
        id="add-widget-noa",
    ),
    pytest.param(
        "PUT",
        "/dashboards/any-id/widgets/w1",
        "operator",
        200,
        {"title": "x"},
        id="update-widget-op",
    ),
    pytest.param(
        "PUT",
        "/dashboards/any-id/widgets/w1",
        "viewer",
        403,
        {"title": "x"},
        id="update-widget-viewer",
    ),
    pytest.param(
        "PUT", "/dashboards/any-id/widgets/w1", None, 401, {"title": "x"}, id="uw-noa"
    ),
    pytest.param(
        "DELETE",
        "/dashboards/any-id/widgets/w1",
        "operator",
        204,
        None,
        id="remove-widget-op",
    ),
    pytest.param(
        "DELETE",
        "/dashboards/any-id/widgets/w1",
        "viewer",
        403,
        None,
        id="remove-widget-viewer",
    ),
    pytest.param(
        "DELETE", "/dashboards/any-id/widgets/w1", None, 401, None, id="rw-noa"
    ),
    pytest.param(
        "PUT",
        "/dashboards/any-id/layout",
        "operator",
        200,
        _LAYOUT_BODY,
        id="layout-op",
    ),
    pytest.param(
        "PUT",
        "/dashboards/any-id/layout",
        "viewer",
        403,
        _LAYOUT_BODY,
        id="layout-viewer",
    ),
    pytest.param(
        "PUT", "/dashboards/any-id/layout", None, 401, _LAYOUT_BODY, id="layout-no-auth"
    ),
]


@pytest.mark.parametrize(
    ("method", "endpoint", "username", "expected_status", "body"),
    DASHBOARDS_ACCESS_CONTROL_SCENARIOS,
)
def test_dashboards_access_control(  # noqa: PLR0913
    dashboards_app: FastAPI,
    method: str,
    endpoint: str,
    username: str | None,
    expected_status: int,
    body: object,
) -> None:
    with TestClient(dashboards_app) as client:
        headers: dict[str, str] = {}
        if username is not None:
            token = _login(client, username)
            headers = _auth_header(token)
        resp = client.request(method, endpoint, headers=headers, json=body)
        assert resp.status_code == expected_status


# --- Synoptics RBAC ---
# Write endpoints allow admin + operator; viewer is read-only; no-auth is 401.

_SYNOPTIC_BODY = {"name": "Plate"}
_SYNOPTIC_PUT = "/synoptics/any-id?expected_updated_at=2026-01-01T00:00:00Z"
_SYNOPTIC = Synoptic(id="s1", name="Plate", metadata=ResourceMetadata())


def _build_synoptics_mock() -> AsyncMock:
    svc = AsyncMock(spec=SynopticsServiceInterface)
    svc.list.return_value = Page(items=[], total=0, page=1, size=1)
    svc.create.return_value = _SYNOPTIC
    svc.get.return_value = _SYNOPTIC
    svc.replace.return_value = _SYNOPTIC
    svc.symbol_schemas = MagicMock(return_value={"tank": {}})
    return svc


@pytest.fixture
def synoptics_app() -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersService()
    app.dependency_overrides[get_users_service] = lambda: manager
    app.dependency_overrides[get_synoptics_service] = _build_synoptics_mock
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(synoptics_router, prefix="/synoptics", dependencies=jwt_dep)
    return app


SYNOPTICS_ACCESS_CONTROL_SCENARIOS = [
    pytest.param("GET", "/synoptics/", "viewer", 200, None, id="list-viewer"),
    pytest.param("GET", "/synoptics/", "operator", 200, None, id="list-operator"),
    pytest.param("GET", "/synoptics/", None, 401, None, id="list-no-auth"),
    pytest.param(
        "GET", "/synoptics/symbol-schemas", "viewer", 200, None, id="schemas-viewer"
    ),
    pytest.param(
        "GET", "/synoptics/symbol-schemas", None, 401, None, id="schemas-no-auth"
    ),
    pytest.param("GET", "/synoptics/any-id", "viewer", 200, None, id="get-viewer"),
    pytest.param("GET", "/synoptics/any-id", None, 401, None, id="get-no-auth"),
    pytest.param(
        "GET", "/synoptics/any-id/export", "viewer", 200, None, id="export-viewer"
    ),
    pytest.param(
        "GET", "/synoptics/any-id/export", None, 401, None, id="export-no-auth"
    ),
    pytest.param(
        "POST", "/synoptics/", "operator", 201, _SYNOPTIC_BODY, id="create-op"
    ),
    pytest.param(
        "POST", "/synoptics/", "viewer", 403, _SYNOPTIC_BODY, id="create-viewer"
    ),
    pytest.param("POST", "/synoptics/", None, 401, _SYNOPTIC_BODY, id="create-no-auth"),
    pytest.param(
        "PUT", _SYNOPTIC_PUT, "operator", 200, _SYNOPTIC_BODY, id="replace-op"
    ),
    pytest.param(
        "PUT", _SYNOPTIC_PUT, "viewer", 403, _SYNOPTIC_BODY, id="replace-viewer"
    ),
    pytest.param("PUT", _SYNOPTIC_PUT, None, 401, _SYNOPTIC_BODY, id="replace-no-auth"),
    pytest.param("DELETE", "/synoptics/any-id", "operator", 204, None, id="delete-op"),
    pytest.param(
        "DELETE", "/synoptics/any-id", "viewer", 403, None, id="delete-viewer"
    ),
    pytest.param("DELETE", "/synoptics/any-id", None, 401, None, id="delete-no-auth"),
]


@pytest.mark.parametrize(
    ("method", "endpoint", "username", "expected_status", "body"),
    SYNOPTICS_ACCESS_CONTROL_SCENARIOS,
)
def test_synoptics_access_control(  # noqa: PLR0913
    synoptics_app: FastAPI,
    method: str,
    endpoint: str,
    username: str | None,
    expected_status: int,
    body: object,
) -> None:
    with TestClient(synoptics_app) as client:
        headers: dict[str, str] = {}
        if username is not None:
            token = _login(client, username)
            headers = _auth_header(token)
        resp = client.request(method, endpoint, headers=headers, json=body)
        assert resp.status_code == expected_status


@pytest.mark.parametrize("username", [None, "viewer", "operator", "admin"])
@pytest.mark.parametrize(
    ("method", "path", "body", "success"),
    [
        ("GET", "/devices/tags", None, 200),
        (
            "POST",
            "/devices/tags/bulk",
            {
                "target": {"ids": []},
                "operation": "add",
                "key": "ecs",
                "values": ["east"],
            },
            200,
        ),
        (
            "POST",
            "/devices/tags/rename",
            {"key": "ecs", "old_value": "east", "new_value": "west"},
            200,
        ),
        (
            "POST",
            "/devices/commands/preview",
            {
                "target": {"tags": {"ecs": ["east"]}},
                "attribute": "setpoint",
                "value": 24,
            },
            200,
        ),
        (
            "POST",
            "/devices/commands/confirm",
            {"token": "token", "device_ids": ["a"]},
            202,
        ),
        ("GET", "/device-views", None, 200),
        ("GET", "/device-views/v", None, 200),
        ("POST", "/device-views", {"name": "Building", "group_by": ["floor"]}, 201),
        ("PUT", "/device-views/v", {"name": "Building", "group_by": ["floor"]}, 200),
        ("DELETE", "/device-views/v", None, 204),
    ],
)
def test_tags_views_and_confirmation_permissions(username, method, path, body, success):
    from api.dependencies import get_device_manager
    from api.routes.command_router import get_selection_commands
    from api.routes.device_views_router import get_device_views_service
    from api.routes.device_views_router import router as view_router
    from api.schemas.command import BatchDispatchResponse, DevicesFilterBody
    from api.selection_commands import SelectionCommandPreview, SelectionCommands
    from device_views import DeviceView, DeviceViewsService

    app = _build_devices_app()
    dm = MagicMock()
    dm.list_devices.return_value = []
    dm.mutate_device_tags = AsyncMock(return_value=[])
    app.dependency_overrides[get_device_manager] = lambda: dm
    coordinator = MagicMock(spec=SelectionCommands)
    coordinator.prepare.return_value = SelectionCommandPreview(
        target=DevicesFilterBody(),
        attribute="setpoint",
        value=24,
        token="token",
        members=[],
    )
    coordinator.confirm.return_value = BatchDispatchResponse(
        batch_id="batch", commands=[]
    )
    app.dependency_overrides[get_selection_commands] = lambda: coordinator
    views = AsyncMock(spec=DeviceViewsService)
    now = datetime.now(UTC)
    view = DeviceView(
        id="v", name="Building", group_by=["floor"], created_at=now, updated_at=now
    )
    views.list.return_value = [view]
    views.get.return_value = view
    views.create.return_value = view
    views.update.return_value = view
    app.dependency_overrides[get_device_views_service] = lambda: views
    app.include_router(
        view_router, prefix="/device-views", dependencies=[Depends(get_current_user_id)]
    )
    with TestClient(app) as client:
        headers = _auth_header(_login(client, username)) if username else {}
        response = client.request(method, path, json=body, headers=headers)
    expected = (
        401
        if username is None
        else 403
        if username == "viewer" and method != "GET"
        else success
    )
    assert response.status_code == expected


# --- devices:read scopes: what a scoped role is served (AGR-1209) ---

_THERMOSTAT = Device(
    id="thermo",
    name="Thermostat",
    type="thermostat",
    attributes={
        "temperature": Attribute.create("temperature", DataType.FLOAT, {"read"}),
        "mode": Attribute.create("mode", DataType.STRING, {"read", "write"}),
    },
    config={},
    driver_id="thermocktat_http",
    transport_id="http",
)
_ROOM = Device(
    id="room",
    name="Room",
    attributes={
        "humidity": Attribute.create("humidity", DataType.FLOAT, {"read"}),
    },
    config={},
    driver_id="webhook_room",
    transport_id="webhook",
)


def _fault(device: Device, attribute: str) -> FaultView:
    return FaultView(
        device_id=device.id,
        device_name=device.name,
        attribute_name=attribute,
        data_type=DataType.BOOL,
        severity=Severity.ALERT,
        current_value=True,
        last_updated=datetime(2026, 9, 22, tzinfo=UTC),
        last_changed=datetime(2026, 9, 22, tzinfo=UTC),
    )


def _build_scoped_devices_app() -> FastAPI:
    """The devices routes over a fake service on ``app.state``: the real
    ``get_device_reads`` runs, so the projection is what is under test."""
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    devices = {d.id: d for d in (_THERMOSTAT, _ROOM)}
    dm = MagicMock(spec=DevicesServiceInterface)
    dm.list_devices.side_effect = lambda **_: list(devices.values())

    def _get_device(device_id: str) -> Device:
        if device_id not in devices:
            raise NotFoundError(device_id)
        return devices[device_id]

    dm.get_device.side_effect = _get_device
    dm.list_active_faults.return_value = [
        _fault(_THERMOSTAT, "mode"),
        _fault(_ROOM, "humidity"),
    ]
    dm.get_attribute_logs.return_value = AttributeLogs(read=[], write=[], listen=[])
    app.state.device_manager = dm
    ts_mock = AsyncMock(default_timezone="UTC")
    ts_mock.list_series.return_value = []
    commands = AsyncMock(spec=CommandsServiceInterface)
    commands.get_commands.return_value = Page(
        items=[_command(1, _THERMOSTAT, "mode"), _command(2, _ROOM, "humidity")],
        total=2,
        page=1,
        size=50,
    )
    app.dependency_overrides[get_users_service] = MockUsersService
    app.dependency_overrides[get_ts_service] = lambda: ts_mock
    app.dependency_overrides[get_commands_service] = lambda: commands
    register_exception_handlers(app)
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(devices_router, prefix="/devices", dependencies=jwt_dep)
    app.include_router(faults_router, prefix="/devices/faults", dependencies=jwt_dep)
    app.include_router(command_router, prefix="/devices", dependencies=jwt_dep)
    return app


def _command(command_id: int, device: Device, attribute: str) -> UnitCommand:
    now = datetime(2026, 9, 22, tzinfo=UTC)
    return UnitCommand(
        id=command_id,
        batch_id=None,
        template_id=None,
        device_id=device.id,
        attribute=attribute,
        value=1,
        data_type=DataType.FLOAT,
        status=CommandStatus.SUCCESS,
        status_details=None,
        user_id="admin-id",
        created_at=now,
        executed_at=now,
        completed_at=now,
    )


SCOPE_SCENARIOS = [
    pytest.param(
        "reader",
        "/devices/",
        200,
        lambda b: [d["id"] for d in b] == ["thermo"],
        id="list-hides-room",
    ),
    pytest.param(
        "reader",
        "/devices/thermo",
        200,
        lambda b: list(b["attributes"]) == ["temperature", "mode"],
        id="thermostat-whole",
    ),
    pytest.param("reader", "/devices/room", 404, None, id="room-404"),
    pytest.param(
        "reader",
        "/devices/attributes",
        200,
        lambda b: {a["attribute"] for a in b["attributes"]} == {"temperature", "mode"},
        id="coverage-without-humidity",
    ),
    pytest.param(
        "reader",
        "/devices/faults/",
        200,
        lambda b: [f["device_id"] for f in b] == ["thermo"],
        id="faults-without-room",
    ),
    pytest.param(
        "reader", "/devices/room/humidity/logs", 404, None, id="logs-hidden-404"
    ),
    pytest.param("reader", "/devices/thermo/mode/logs", 200, None, id="logs-visible"),
    pytest.param(
        "reader", "/devices/room/timeseries", 404, None, id="timeseries-hidden-404"
    ),
    pytest.param(
        "reader", "/devices/room/commands", 404, None, id="history-hidden-404"
    ),
    pytest.param(
        "reader",
        "/devices/commands",
        200,
        lambda b: [c["device_id"] for c in b["items"]] == ["thermo"],
        id="history-filtered",
    ),
    pytest.param(
        "admin",
        "/devices/commands",
        200,
        lambda b: len(b["items"]) == 2,
        id="admin-history",
    ),
    pytest.param(
        "admin",
        "/devices/",
        200,
        lambda b: [d["id"] for d in b] == ["thermo", "room"],
        id="admin-sees-all",
    ),
    pytest.param("admin", "/devices/room", 200, None, id="admin-room"),
    pytest.param(
        "admin", "/devices/faults/", 200, lambda b: len(b) == 2, id="admin-faults"
    ),
]


@pytest.mark.parametrize(("username", "path", "expected", "check"), SCOPE_SCENARIOS)
def test_devices_read_scopes_project_every_read_path(username, path, expected, check):
    with TestClient(_build_scoped_devices_app()) as client:
        headers = _auth_header(_login(client, username))
        resp = client.get(path, headers=headers)
    assert resp.status_code == expected, resp.text
    if check is not None:
        assert check(resp.json()), resp.json()


# A route serving device data must read through the caller's policy. Walk
# the real app: every route gated by a device-reading permission resolves
# the scoped reads (directly or through the target resolver), or is listed
# here, consciously.
_DEVICE_READ_PERMISSIONS = {
    Permission.DEVICES_READ,
    Permission.DEVICES_LOGS_READ,
    Permission.TIMESERIES_READ,
}
_SCOPED_READS = {get_device_reads, get_target_resolver}
_UNSCOPED_ALLOWED = {
    # Vocabulary, not device data.
    ("GET", "/devices/standard-types"),
    ("GET", "/presentations/schema"),
    ("GET", "/devices/timeseries/aggregate/options"),
    # Documents naming devices by filter or by id, never their values:
    # metadata a scoped role may see, like `excluded_device_ids` (ADR 0004 §5).
    ("GET", "/devices/commands/templates/"),
    ("GET", "/devices/commands/templates/{template_id}"),
    ("GET", "/device-views"),
    ("GET", "/device-views/{view_id}"),
}


def _dependency_calls(dependant) -> set:
    calls = {dependant.call}
    for sub in dependant.dependencies:
        calls |= _dependency_calls(sub)
    return calls


def _route_permissions(route: APIRoute) -> set[Permission]:
    perms = set()
    for dep in route.dependant.dependencies:
        if dep.call is None:
            continue
        perm = inspect.getclosurevars(dep.call).nonlocals.get("perm")
        if isinstance(perm, Permission):
            perms.add(perm)
    return perms


def test_every_device_reading_route_goes_through_the_scoped_reads() -> None:
    offenders = set()
    for route in create_app().routes:
        if not isinstance(route, APIRoute):
            continue
        if not _route_permissions(route) & _DEVICE_READ_PERMISSIONS:
            continue
        if _dependency_calls(route.dependant) & _SCOPED_READS:
            continue
        offenders |= {(m, route.path) for m in route.methods}
    assert offenders == _UNSCOPED_ALLOWED
