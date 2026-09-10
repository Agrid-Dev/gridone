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
from models.errors import NotFoundError
from users import Role, User
from users.auth import AuthService
from users.permissions import Permission

ADMIN = User(id="admin-id", username="admin", role="admin")
VIEWER_ROLE = Role(
    id="viewer",
    name="Viewer",
    description="Read-only access.",
    permissions=[Permission.ROLES_READ],
    builtin=True,
)


@pytest.fixture
def app() -> FastAPI:
    um = AsyncMock()
    um.authenticate = AsyncMock(return_value=ADMIN)
    um.get_by_id = AsyncMock(return_value=ADMIN)
    um.is_blocked = AsyncMock(return_value=False)
    um.list_roles = AsyncMock(return_value=[VIEWER_ROLE])

    async def _get_role(role_id: str) -> Role:
        if role_id != VIEWER_ROLE.id:
            msg = f"Role '{role_id}' not found"
            raise NotFoundError(msg)
        return VIEWER_ROLE

    um.get_role = AsyncMock(side_effect=_get_role)

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


def test_list_roles_returns_the_service_roles(app: FastAPI) -> None:
    with TestClient(app) as client:
        resp = client.get("/users/roles/", headers=_auth(client))
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
