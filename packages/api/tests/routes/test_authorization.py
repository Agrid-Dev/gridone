"""Tests that RBAC permissions are enforced on API endpoints."""

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_current_user_id, get_users_manager
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


def _build_app() -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersManager()
    app.dependency_overrides[get_users_manager] = lambda: manager
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(users_router, prefix="/users", dependencies=jwt_dep)
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
        assert all(set(u.keys()) == {"id", "display_name"} for u in data)
        names = {u["display_name"] for u in data}
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
