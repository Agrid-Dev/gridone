import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from models.errors import BlockedUserError
from users import Role, User
from users.auth import AuthService
from users.validation import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
)

from api.dependencies import get_users_service
from api.exception_handlers import register_exception_handlers
from api.routes.users.auth_router import router


class MockUsersService:
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
    manager = MockUsersService()
    app.dependency_overrides[get_users_service] = lambda: manager
    register_exception_handlers(app)
    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


def _login(client: TestClient) -> dict:
    return client.post(
        "/token",
        data={"grant_type": "password", "username": "admin", "password": "admin"},
    ).json()


# --- /schema ---


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


# --- /token (OAuth2 ROPC) ---


def test_token_password_grant_success(client: TestClient) -> None:
    response = client.post(
        "/token",
        data={"grant_type": "password", "username": "admin", "password": "admin"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 30 * 60


def test_token_password_grant_sets_cookies(client: TestClient) -> None:
    response = client.post(
        "/token",
        data={"grant_type": "password", "username": "admin", "password": "admin"},
    )
    assert response.status_code == 200
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


def test_token_password_grant_invalid_credentials(client: TestClient) -> None:
    response = client.post(
        "/token",
        data={"grant_type": "password", "username": "admin", "password": "wrong"},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password"}


def test_token_refresh_grant_success(client: TestClient) -> None:
    refresh_token = _login(client)["refresh_token"]

    response = client.post(
        "/token",
        data={"grant_type": "refresh_token", "refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["expires_in"] == 30 * 60


def test_token_refresh_grant_via_cookie(client: TestClient) -> None:
    """Browser flow: refresh token is sent as an httpOnly cookie."""
    login_resp = client.post(
        "/token",
        data={"grant_type": "password", "username": "admin", "password": "admin"},
    )
    refresh_cookie = login_resp.cookies.get("refresh_token")
    assert refresh_cookie is not None

    response = client.post(
        "/token",
        data={"grant_type": "refresh_token"},
        cookies={"refresh_token": refresh_cookie},
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_token_refresh_grant_invalid_token(client: TestClient) -> None:
    response = client.post(
        "/token",
        data={"grant_type": "refresh_token", "refresh_token": "bad-token"},
    )
    assert response.status_code == 401


def test_token_refresh_grant_missing_token(client: TestClient) -> None:
    response = client.post("/token", data={"grant_type": "refresh_token"})
    assert response.status_code == 401


def test_token_access_token_rejected_as_refresh(app: FastAPI) -> None:
    """An access token must not be accepted as a refresh token."""
    with TestClient(app) as c:
        access_token = c.post(
            "/token",
            data={"grant_type": "password", "username": "admin", "password": "admin"},
        ).json()["access_token"]
    with TestClient(app) as c:
        response = c.post(
            "/token",
            data={"grant_type": "refresh_token", "refresh_token": access_token},
        )
    assert response.status_code == 401


def test_token_unsupported_grant_type(client: TestClient) -> None:
    response = client.post("/token", data={"grant_type": "client_credentials"})
    assert response.status_code == 422


def test_token_blocked_user_password_grant_returns_403(client: TestClient) -> None:
    response = client.post(
        "/token",
        data={"grant_type": "password", "username": "blocked", "password": "blocked"},
    )
    assert response.status_code == 403
    assert "blocked" in response.json()["detail"].lower()


def test_token_blocked_user_refresh_grant_returns_403(app: FastAPI) -> None:
    auth_service: AuthService = app.state.auth_service
    refresh_token = auth_service.create_refresh_token("blocked-id", "operator")

    with TestClient(app) as client:
        response = client.post(
            "/token",
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
        )
    assert response.status_code == 403
    assert "blocked" in response.json()["detail"].lower()


# --- /me ---


def test_me_with_bearer_header(client: TestClient) -> None:
    access_token = _login(client)["access_token"]

    response = client.get("/me", headers={"Authorization": f"Bearer {access_token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "admin"
    assert data["role"] == "admin"
    assert "permissions" in data
    assert "users:read" in data["permissions"]
    assert "devices:read" in data["permissions"]


def test_me_with_cookie(client: TestClient) -> None:
    """Browser flow: access token is sent as an httpOnly cookie."""
    login_resp = client.post(
        "/token",
        data={"grant_type": "password", "username": "admin", "password": "admin"},
    )
    access_cookie = login_resp.cookies.get("access_token")
    assert access_cookie is not None

    response = client.get("/me", cookies={"access_token": access_cookie})
    assert response.status_code == 200
    assert response.json()["username"] == "admin"


# --- /logout ---


def test_logout_clears_cookies(client: TestClient) -> None:
    login_resp = client.post(
        "/token",
        data={"grant_type": "password", "username": "admin", "password": "admin"},
    )
    assert "access_token" in login_resp.cookies

    response = client.post("/logout")
    assert response.status_code == 200
    assert response.json() == {"detail": "Logged out"}
    assert response.headers.get("set-cookie") is not None
    assert 'access_token=""' in response.headers.get("set-cookie", "")
