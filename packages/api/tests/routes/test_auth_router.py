import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_users_manager
from api.routes.users.auth_router import router
from models.errors import BlockedUserError
from users import Role, User
from users.auth import AuthService
from users.validation import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
)


class MockUsersManager:
    def __init__(self) -> None:
        self._credentials = {"admin": "admin", "blocked": "blocked"}
        self._users = {
            "admin": User(
                id="admin-id",
                username="admin",
                role=Role.ADMIN,
            ),
            "blocked": User(
                id="blocked-id",
                username="blocked",
                role=Role.OPERATOR,
                is_blocked=True,
            ),
        }

    async def authenticate(self, username: str, password: str) -> User | None:
        if self._credentials.get(username) != password:
            return None
        user = self._users[username]
        if user.is_blocked:
            msg = f"User '{username}' is blocked"
            raise BlockedUserError(msg)
        return user

    async def get_by_id(self, user_id: str) -> User:
        for user in self._users.values():
            if user.id == user_id:
                return user
        msg = f"User '{user_id}' not found"
        raise RuntimeError(msg)

    async def is_blocked(self, user_id: str) -> bool:
        for user in self._users.values():
            if user.id == user_id:
                return user.is_blocked
        return False


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    manager = MockUsersManager()
    app.dependency_overrides[get_users_manager] = lambda: manager
    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


def test_get_auth_schema(client: TestClient) -> None:
    response = client.get("/schema")
    assert response.status_code == 200
    data = response.json()
    assert data.get("type") == "object"
    assert "username" in data.get("properties", {})
    assert "password" in data.get("properties", {})
    assert data["properties"]["username"]["minLength"] == USERNAME_MIN_LENGTH
    assert data["properties"]["username"]["maxLength"] == USERNAME_MAX_LENGTH
    assert data["properties"]["password"]["minLength"] == PASSWORD_MIN_LENGTH
    assert data["properties"]["password"]["maxLength"] == PASSWORD_MAX_LENGTH
    assert set(data.get("required", [])) == {"username", "password"}


def test_login_unknown_user_shows_auth_error(client: TestClient) -> None:
    response = client.post(
        "/login",
        data={
            "grant_type": "password",
            "username": "x" * USERNAME_MIN_LENGTH,
            "password": "x" * PASSWORD_MIN_LENGTH,
        },
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password"}


def test_login_success_returns_tokens(client: TestClient) -> None:
    response = client.post(
        "/login",
        data={
            "grant_type": "password",
            "username": "admin",
            "password": "admin",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_sets_httponly_cookies(client: TestClient) -> None:
    response = client.post(
        "/login",
        data={
            "grant_type": "password",
            "username": "admin",
            "password": "admin",
        },
    )
    assert response.status_code == 200
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


def test_refresh_with_valid_token_in_body(client: TestClient) -> None:
    login_response = client.post(
        "/login",
        data={
            "grant_type": "password",
            "username": "admin",
            "password": "admin",
        },
    )
    refresh_token = login_response.json()["refresh_token"]

    response = client.post(
        "/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_refresh_via_cookie(client: TestClient) -> None:
    """Browser flow: refresh token is sent as an httpOnly cookie."""
    login_response = client.post(
        "/login",
        data={
            "grant_type": "password",
            "username": "admin",
            "password": "admin",
        },
    )
    refresh_cookie = login_response.cookies.get("refresh_token")
    assert refresh_cookie is not None

    # Send refresh token as cookie (no body)
    response = client.post(
        "/refresh",
        cookies={"refresh_token": refresh_cookie},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_refresh_with_invalid_token(client: TestClient) -> None:
    response = client.post(
        "/refresh",
        json={"refresh_token": "invalid-token"},
    )
    assert response.status_code == 401


def test_refresh_with_access_token_rejected(app: FastAPI) -> None:
    """An access token cannot be used as a refresh token."""
    # Use a separate client so the refresh cookie from login is not persisted
    with TestClient(app) as login_client:
        login_response = login_client.post(
            "/login",
            data={
                "grant_type": "password",
                "username": "admin",
                "password": "admin",
            },
        )
    access_token = login_response.json()["access_token"]

    with TestClient(app) as fresh_client:
        response = fresh_client.post(
            "/refresh",
            json={"refresh_token": access_token},
        )
    assert response.status_code == 401


def test_me_with_bearer_header(client: TestClient) -> None:
    login_response = client.post(
        "/login",
        data={
            "grant_type": "password",
            "username": "admin",
            "password": "admin",
        },
    )
    access_token = login_response.json()["access_token"]

    response = client.get(
        "/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "admin"
    assert data["role"] == "admin"
    assert "permissions" in data
    assert "users:read" in data["permissions"]
    assert "devices:read" in data["permissions"]


def test_me_with_cookie(client: TestClient) -> None:
    """Browser flow: access token is sent as an httpOnly cookie."""
    login_response = client.post(
        "/login",
        data={
            "grant_type": "password",
            "username": "admin",
            "password": "admin",
        },
    )
    access_cookie = login_response.cookies.get("access_token")
    assert access_cookie is not None

    response = client.get(
        "/me",
        cookies={"access_token": access_cookie},
    )
    assert response.status_code == 200
    assert response.json()["username"] == "admin"


def test_logout_clears_cookies(client: TestClient) -> None:
    login_response = client.post(
        "/login",
        data={
            "grant_type": "password",
            "username": "admin",
            "password": "admin",
        },
    )
    assert "access_token" in login_response.cookies

    response = client.post("/logout")
    assert response.status_code == 200
    assert response.json() == {"detail": "Logged out"}
    # Cookies are cleared (max_age=0)
    assert response.headers.get("set-cookie") is not None
    assert 'access_token=""' in response.headers.get("set-cookie", "")


# --- Blocked user tests ---


def test_login_blocked_user_returns_403(client: TestClient) -> None:
    response = client.post(
        "/login",
        data={
            "grant_type": "password",
            "username": "blocked",
            "password": "blocked",
        },
    )
    assert response.status_code == 403
    assert "blocked" in response.json()["detail"].lower()


def test_refresh_blocked_user_returns_403(app: FastAPI) -> None:
    """A blocked user cannot refresh tokens even with a valid refresh token."""
    auth_service: AuthService = app.state.auth_service
    # Create a refresh token for the blocked user
    refresh_token = auth_service.create_refresh_token("blocked-id", "operator")

    with TestClient(app) as client:
        response = client.post(
            "/refresh",
            json={"refresh_token": refresh_token},
        )
    assert response.status_code == 403
    assert "blocked" in response.json()["detail"].lower()
