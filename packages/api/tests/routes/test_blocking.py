"""Tests for the user blocking system (block/unblock endpoints + JWT rejection)."""

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from models.errors import BlockedUserError, NotFoundError

from users import Role, User
from users.auth import AuthService

from api.dependencies import get_current_user_id, get_users_manager
from api.routes.users.auth_router import router as auth_router
from api.routes.users.users_router import router as users_router


class MockUsersManager:
    def __init__(self) -> None:
        self._credentials = {"admin": "admin", "bob": "bob"}
        self._users: dict[str, User] = {
            "admin": User(
                id="admin-id",
                username="admin",
                role=Role.ADMIN,
                name="Admin User",
            ),
            "bob": User(
                id="bob-id",
                username="bob",
                role=Role.OPERATOR,
                name="Bob User",
            ),
        }

    async def authenticate(self, username: str, password: str) -> User | None:
        if self._credentials.get(username) != password:
            return None
        user = self._users.get(username)
        if user and user.is_blocked:
            msg = f"User '{username}' is blocked"
            raise BlockedUserError(msg)
        return user

    async def get_by_id(self, user_id: str) -> User:
        for user in self._users.values():
            if user.id == user_id:
                return user
        msg = f"User '{user_id}' not found"
        raise NotFoundError(msg)

    async def list_users(self) -> list[User]:
        return list(self._users.values())

    async def is_blocked(self, user_id: str) -> bool:
        for user in self._users.values():
            if user.id == user_id:
                return user.is_blocked
        return False

    async def block_user(self, user_id: str) -> User:
        for username, user in self._users.items():
            if user.id == user_id:
                blocked = user.model_copy(update={"is_blocked": True})
                self._users[username] = blocked
                return blocked
        msg = f"User '{user_id}' not found"
        raise NotFoundError(msg)

    async def unblock_user(self, user_id: str) -> User:
        for username, user in self._users.items():
            if user.id == user_id:
                unblocked = user.model_copy(update={"is_blocked": False})
                self._users[username] = unblocked
                return unblocked
        msg = f"User '{user_id}' not found"
        raise NotFoundError(msg)


def _build_app() -> tuple[FastAPI, MockUsersManager]:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersManager()
    app.dependency_overrides[get_users_manager] = lambda: manager
    app.include_router(auth_router, prefix="/auth")
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(users_router, prefix="/users", dependencies=jwt_dep)
    return app, manager


@pytest.fixture
def app_and_manager() -> tuple[FastAPI, MockUsersManager]:
    return _build_app()


@pytest.fixture
def app(app_and_manager: tuple[FastAPI, MockUsersManager]) -> FastAPI:
    return app_and_manager[0]


@pytest.fixture
def manager(app_and_manager: tuple[FastAPI, MockUsersManager]) -> MockUsersManager:
    return app_and_manager[1]


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


def test_admin_can_unblock_user(app: FastAPI, manager: MockUsersManager) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        # Block first
        client.post("/users/bob-id/block", headers=_auth(token))
        # Then unblock
        resp = client.post("/users/bob-id/unblock", headers=_auth(token))
        assert resp.status_code == 200
        assert resp.json()["is_blocked"] is False


def test_unblock_nonexistent_user_returns_404(app: FastAPI) -> None:
    with TestClient(app) as client:
        token = _login(client, "admin")
        resp = client.post("/users/nonexistent/unblock", headers=_auth(token))
        assert resp.status_code == 404


# --- Blocked user JWT rejection ---


def test_blocked_user_jwt_is_rejected(app: FastAPI) -> None:
    """After blocking, existing JWTs should be rejected with 403."""
    with TestClient(app) as client:
        # Bob logs in (gets a valid token)
        bob_token = _login(client, "bob")
        admin_token = _login(client, "admin")

        # Admin blocks Bob
        resp = client.post("/users/bob-id/block", headers=_auth(admin_token))
        assert resp.status_code == 200

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
