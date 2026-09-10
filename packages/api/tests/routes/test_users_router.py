"""Tests for users_router block/unblock, JWT rejection and password limits."""

from unittest.mock import AsyncMock

import pytest
from conftest import OVERSIZED_PASSWORDS
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from api.auth import get_current_user_id
from api.dependencies import get_users_service
from api.exception_handlers import register_exception_handlers
from api.routes.users.auth_router import router as auth_router
from api.routes.users.users_router import router as users_router
from models.errors import BlockedUserError, NotFoundError
from users import Role, User, UserUpdate
from users.auth import AuthService

ADMIN = User(id="admin-id", username="admin", role=Role.ADMIN, name="Admin User")
BOB = User(id="bob-id", username="bob", role=Role.OPERATOR, name="Bob User")


async def _update_user(user_id: str, data: UserUpdate) -> User:
    if user_id != BOB.id:
        msg = f"User '{user_id}' not found"
        raise NotFoundError(msg)
    return BOB.model_copy(update={"name": data.name or BOB.name})


@pytest.fixture
def users_manager() -> AsyncMock:
    um = AsyncMock()

    async def _authenticate(username: str, password: str) -> User | None:
        creds = {"admin": "admin", "bob": "bob"}
        users = {"admin": ADMIN, "bob": BOB}
        if creds.get(username) != password:
            return None
        user = users[username]
        if user.is_blocked:
            msg = f"User '{username}' is blocked"
            raise BlockedUserError(msg)
        return user

    async def _get_by_id(user_id: str) -> User:
        for user in (ADMIN, BOB):
            if user.id == user_id:
                return user
        msg = f"User '{user_id}' not found"
        raise NotFoundError(msg)

    async def _is_blocked(user_id: str) -> bool:
        for user in (ADMIN, BOB):
            if user.id == user_id:
                return user.is_blocked
        return False

    um.authenticate = AsyncMock(side_effect=_authenticate)
    um.update_user = AsyncMock(side_effect=_update_user)
    um.get_by_id = AsyncMock(side_effect=_get_by_id)
    um.is_blocked = AsyncMock(side_effect=_is_blocked)
    um.list_users = AsyncMock(return_value=[ADMIN, BOB])
    um.block_user = AsyncMock(
        side_effect=lambda uid: (
            BOB.model_copy(update={"is_blocked": True})
            if uid == "bob-id"
            else (_ for _ in ()).throw(NotFoundError(f"User '{uid}' not found"))
        ),
    )
    um.unblock_user = AsyncMock(
        side_effect=lambda uid: (
            BOB.model_copy(update={"is_blocked": False})
            if uid == "bob-id"
            else (_ for _ in ()).throw(NotFoundError(f"User '{uid}' not found"))
        ),
    )
    um.delete_user = AsyncMock(
        side_effect=lambda uid: (
            None
            if uid == "bob-id"
            else (_ for _ in ()).throw(NotFoundError(f"User '{uid}' not found"))
        ),
    )
    return um


@pytest.fixture
def app(users_manager: AsyncMock) -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    app.dependency_overrides[get_users_service] = lambda: users_manager
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(users_router, prefix="/users", dependencies=jwt_dep)
    register_exception_handlers(app)
    return app


def _login(client: TestClient, username: str) -> str:
    resp = client.post(
        "/auth/token",
        data={"grant_type": "password", "username": username, "password": username},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- Block endpoint ---


def test_admin_can_block_user(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post("/users/bob-id/block", headers=_auth(token))
        assert resp.status_code == 200
        assert resp.json()["is_blocked"] is True


def test_block_self_returns_400(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post("/users/admin-id/block", headers=_auth(token))
        assert resp.status_code == 400
        assert "your own" in resp.json()["detail"].lower()


def test_block_nonexistent_user_returns_404(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post("/users/nonexistent/block", headers=_auth(token))
        assert resp.status_code == 404


# --- Unblock endpoint ---


def test_admin_can_unblock_user(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post("/users/bob-id/unblock", headers=_auth(token))
        assert resp.status_code == 200
        assert resp.json()["is_blocked"] is False


def test_unblock_nonexistent_user_returns_404(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post("/users/nonexistent/unblock", headers=_auth(token))
        assert resp.status_code == 404


# --- Blocked user JWT rejection ---


def test_blocked_user_jwt_is_rejected(app: FastAPI, users_manager: AsyncMock) -> None:
    """After blocking, existing JWTs should be rejected with 403."""
    with TestClient(app) as client:
        bob_token = _login(client, "bob")
        admin_token = _login(client, "admin")

        # Admin blocks Bob
        resp = client.post("/users/bob-id/block", headers=_auth(admin_token))
        assert resp.status_code == 200

        # The JWT dep reads is_blocked directly.
        users_manager.is_blocked = AsyncMock(
            side_effect=lambda uid: uid == "bob-id",
        )

        # Bob's existing token is now rejected
        resp = client.get("/auth/me", headers=_auth(bob_token))
        assert resp.status_code == 403
        assert "blocked" in resp.json()["detail"].lower()


# --- Non-admin cannot block ---


def test_operator_cannot_block_user(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "bob")
        resp = client.post("/users/admin-id/block", headers=_auth(token))
        assert resp.status_code == 403


# --- Get user ---


def test_admin_can_get_user(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.get("/users/bob-id", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["username"] == "bob"


def test_get_nonexistent_user_returns_404(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.get("/users/nonexistent", headers=_auth(token))
    assert resp.status_code == 404


# --- Delete user ---


def test_admin_can_delete_user(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.delete("/users/bob-id", headers=_auth(token))
    assert resp.status_code == 204


def test_delete_self_returns_400(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.delete("/users/admin-id", headers=_auth(token))
    assert resp.status_code == 400
    assert "your own" in resp.json()["detail"].lower()


def test_delete_nonexistent_user_returns_404(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.delete("/users/nonexistent", headers=_auth(token))
    assert resp.status_code == 404


# --- Create user ---


def test_create_user_conflict_returns_409(
    app: FastAPI, users_manager: AsyncMock
) -> None:
    users_manager.create_user.side_effect = ValueError("Username already taken")
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post(
            "/users/",
            json={"username": "duplicate", "password": "password123"},
            headers=_auth(token),
        )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Username already exists"


# --- Update user ---


def test_admin_can_update_user(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.patch(
            "/users/bob-id", json={"name": "Bob B."}, headers=_auth(token)
        )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Bob B."


def test_update_nonexistent_user_returns_404(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.patch(
            "/users/nonexistent", json={"name": "Nobody"}, headers=_auth(token)
        )
    assert resp.status_code == 404


def test_update_user_conflict_returns_409(
    app: FastAPI, users_manager: AsyncMock
) -> None:
    users_manager.update_user.side_effect = ValueError("Username already taken")
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.patch(
            "/users/bob-id", json={"username": "admin"}, headers=_auth(token)
        )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Username already exists"


# --- Password length contract ---


# (method, path, extra body fields, service method that must not be reached)
WRITE_ROUTES = [
    pytest.param(("PATCH", "/users/bob-id", {}, "update_user"), id="update"),
    pytest.param(
        ("POST", "/users/", {"username": "someone"}, "create_user"), id="create"
    ),
]


@pytest.mark.parametrize("password", OVERSIZED_PASSWORDS)
@pytest.mark.parametrize("route", WRITE_ROUTES)
def test_rejects_oversized_password(
    app: FastAPI,
    users_manager: AsyncMock,
    password: str,
    route: tuple[str, str, dict, str],
) -> None:
    """Request validation refuses it before anything reaches bcrypt."""
    method, path, body, mock_name = route
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.request(
            method, path, json={**body, "password": password}, headers=_auth(token)
        )

    assert resp.status_code == 422
    getattr(users_manager, mock_name).assert_not_called()
