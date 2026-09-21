"""Tests for roles_router HTTP wiring: the service is mocked."""

from unittest.mock import AsyncMock

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from api.auth import get_current_user_id
from api.dependencies import get_users_service
from api.exception_handlers import register_exception_handlers
from api.routes.users.auth_router import router as auth_router
from api.routes.users.roles_router import router as roles_router
from api.routes.users.users_router import router as users_router
from models.errors import ConflictError, NotFoundError
from users import Role, RoleCreate, RoleUpdate, User
from users.auth import AuthService
from users.permissions import Permission
from users.roles import get_permissions_for_role

ADMIN = User(id="admin-id", username="admin", role="admin")
VIEWER_ROLE = Role(
    id="viewer",
    name="Viewer",
    description="Read-only access.",
    permissions=[Permission.ROLES_READ],
    builtin=True,
)
CUSTOM_ROLE = Role(
    id="thermostat_operator",
    name="Thermostat operator",
    permissions=[Permission.DEVICES_COMMAND, Permission.DEVICES_READ],
)
CREATE_BODY = {
    "id": "thermostat_operator",
    "name": "Thermostat operator",
    "permissions": ["devices:read", "devices:command"],
}


@pytest.fixture
def um() -> AsyncMock:
    um = AsyncMock()
    um.authenticate = AsyncMock(return_value=ADMIN)
    um.get_by_id = AsyncMock(return_value=ADMIN)
    um.is_blocked = AsyncMock(return_value=False)
    um.get_role_permissions = AsyncMock(side_effect=get_permissions_for_role)
    um.list_roles = AsyncMock(return_value=[VIEWER_ROLE])

    async def _get_role(role_id: str) -> Role:
        if role_id != VIEWER_ROLE.id:
            msg = f"Role '{role_id}' not found"
            raise NotFoundError(msg)
        return VIEWER_ROLE

    um.get_role = AsyncMock(side_effect=_get_role)
    um.create_role = AsyncMock(side_effect=RoleCreate.to_role)
    um.update_role = AsyncMock(
        side_effect=lambda role_id, update: update.apply_to(
            CUSTOM_ROLE.model_copy(update={"id": role_id})
        )
    )
    um.delete_role = AsyncMock(return_value=None)
    return um


@pytest.fixture
def app(um: AsyncMock) -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    app.dependency_overrides[get_users_service] = lambda: um
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    # Same order as app.py: the roles router must win over /users/{user_id}.
    app.include_router(roles_router, prefix="/users/roles", dependencies=jwt_dep)
    app.include_router(users_router, prefix="/users", dependencies=jwt_dep)
    register_exception_handlers(app)
    return app


def _auth(client: TestClient) -> dict[str, str]:
    resp = client.post(
        "/auth/token",
        data={"grant_type": "password", "username": "admin", "password": "admin"},
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.mark.parametrize("path", ["/users/roles", "/users/roles/"])
def test_list_roles_returns_the_service_roles(app: FastAPI, path: str) -> None:
    with TestClient(app) as client:
        resp = client.get(path, headers=_auth(client))
        assert resp.status_code == 200
        assert resp.json() == [VIEWER_ROLE.model_dump()]


def test_get_role_by_id(app: FastAPI) -> None:
    with TestClient(app) as client:
        resp = client.get("/users/roles/viewer", headers=_auth(client))
        assert resp.status_code == 200
        assert resp.json()["id"] == "viewer"


def test_get_unknown_role_returns_404(app: FastAPI) -> None:
    with TestClient(app) as client:
        resp = client.get("/users/roles/ghost", headers=_auth(client))
        assert resp.status_code == 404


class TestCreate:
    @pytest.mark.parametrize("path", ["/users/roles", "/users/roles/"])
    def test_returns_201_with_the_created_document(
        self, app: FastAPI, um: AsyncMock, path: str
    ) -> None:
        with TestClient(app) as client:
            resp = client.post(path, json=CREATE_BODY, headers=_auth(client))

        assert resp.status_code == 201
        assert resp.json() == CUSTOM_ROLE.model_dump()
        um.create_role.assert_awaited_once_with(RoleCreate.model_validate(CREATE_BODY))

    def test_conflict_is_409(self, app: FastAPI, um: AsyncMock) -> None:
        um.create_role.side_effect = ConflictError("Role 'viewer' already exists")
        with TestClient(app) as client:
            resp = client.post(
                "/users/roles",
                json={**CREATE_BODY, "id": "viewer"},
                headers=_auth(client),
            )
        assert resp.status_code == 409

    @pytest.mark.parametrize(
        "body",
        [
            pytest.param({**CREATE_BODY, "scopes": {}}, id="scopes-key"),
            pytest.param({**CREATE_BODY, "id": "Not-A-Slug"}, id="bad-id"),
            pytest.param(
                {**CREATE_BODY, "permissions": ["devices:fly"]}, id="unknown-permission"
            ),
        ],
    )
    def test_invalid_document_is_422_before_the_service(
        self, app: FastAPI, um: AsyncMock, body: dict
    ) -> None:
        with TestClient(app) as client:
            resp = client.post("/users/roles", json=body, headers=_auth(client))
        assert resp.status_code == 422
        um.create_role.assert_not_awaited()


class TestUpdate:
    def test_returns_the_updated_document(self, app: FastAPI, um: AsyncMock) -> None:
        with TestClient(app) as client:
            resp = client.patch(
                "/users/roles/thermostat_operator",
                json={"name": "Comfort"},
                headers=_auth(client),
            )

        assert resp.status_code == 200
        assert resp.json()["name"] == "Comfort"
        um.update_role.assert_awaited_once_with(
            "thermostat_operator", RoleUpdate(name="Comfort")
        )

    @pytest.mark.parametrize(
        ("error", "expected"),
        [
            pytest.param(ConflictError("built-in"), 409, id="builtin"),
            pytest.param(NotFoundError("ghost"), 404, id="unknown"),
        ],
    )
    def test_service_errors_map_to_status(
        self, app: FastAPI, um: AsyncMock, error: Exception, expected: int
    ) -> None:
        um.update_role.side_effect = error
        with TestClient(app) as client:
            resp = client.patch(
                "/users/roles/x", json={"name": "y"}, headers=_auth(client)
            )
        assert resp.status_code == expected

    def test_scopes_key_is_422(self, app: FastAPI, um: AsyncMock) -> None:
        with TestClient(app) as client:
            resp = client.patch(
                "/users/roles/x", json={"scopes": {}}, headers=_auth(client)
            )
        assert resp.status_code == 422
        um.update_role.assert_not_awaited()


class TestDelete:
    def test_returns_204(self, app: FastAPI, um: AsyncMock) -> None:
        with TestClient(app) as client:
            resp = client.delete(
                "/users/roles/thermostat_operator", headers=_auth(client)
            )
        assert resp.status_code == 204
        um.delete_role.assert_awaited_once_with("thermostat_operator")

    @pytest.mark.parametrize(
        ("error", "expected"),
        [
            pytest.param(ConflictError("assigned"), 409, id="assigned-or-builtin"),
            pytest.param(NotFoundError("ghost"), 404, id="unknown"),
        ],
    )
    def test_service_errors_map_to_status(
        self, app: FastAPI, um: AsyncMock, error: Exception, expected: int
    ) -> None:
        um.delete_role.side_effect = error
        with TestClient(app) as client:
            resp = client.delete("/users/roles/x", headers=_auth(client))
        assert resp.status_code == expected
