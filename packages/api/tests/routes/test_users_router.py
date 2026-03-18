"""Tests for users_router block/unblock endpoints and JWT rejection."""

from unittest.mock import AsyncMock

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from models.errors import BlockedUserError, NotFoundError

from users import Role, User
from users.auth import AuthService

from api.dependencies import get_current_user_id, get_users_manager
from api.exception_handlers import register_exception_handlers
from api.routes.users.auth_router import router as auth_router
from api.routes.users.users_router import router as users_router

ADMIN = User(id="admin-id", username="admin", role=Role.ADMIN, name="Admin User")
BOB = User(id="bob-id", username="bob", role=Role.OPERATOR, name="Bob User")


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
    return um


@pytest.fixture
def app(users_manager: AsyncMock) -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    app.dependency_overrides[get_users_manager] = lambda: users_manager
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(users_router, prefix="/users", dependencies=jwt_dep)
    register_exception_handlers(app)
    return app


def _login(client: TestClient, username: str) -> str:
    resp = client.post(
        "/auth/login",
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

        # Simulate Bob being blocked for is_blocked check
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
