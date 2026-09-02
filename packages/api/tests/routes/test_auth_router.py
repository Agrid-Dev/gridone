import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_users_service
from api.exception_handlers import register_exception_handlers
from api.routes.users.auth_router import router
from models.errors import BlockedUserError, NotFoundError
from users import Role, User
from users.auth import AuthService
from users.validation import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
)


class MockUsersService:
    def __init__(self) -> None:
        self.get_by_id_calls = 0
        self.is_blocked_calls = 0
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
        self.get_by_id_calls += 1
        for user in self._users.values():
            if user.id == user_id:
                return user
        msg = f"User '{user_id}' not found"
        raise NotFoundError(msg)

    async def is_blocked(self, user_id: str) -> bool:
        self.is_blocked_calls += 1
        for user in self._users.values():
            if user.id == user_id:
                return user.is_blocked
        return False

    def set_role(self, username: str, role: Role) -> None:
        """Simulate a role change persisted to storage between two requests."""
        self._users[username] = self._users[username].model_copy(update={"role": role})


@pytest.fixture
def users_service() -> MockUsersService:
    return MockUsersService()


@pytest.fixture
def app(users_service: MockUsersService) -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    app.dependency_overrides[get_users_service] = lambda: users_service
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
    assert data["token_type"] == "bearer"  # noqa: S105 (OAuth token type, not a secret)
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


def test_token_refresh_grant_mints_tokens_from_stored_role(
    app: FastAPI, users_service: MockUsersService
) -> None:
    """A role changed in storage must take effect on the next refresh."""
    auth_service: AuthService = app.state.auth_service
    with TestClient(app) as client:
        refresh_token = _login(client)["refresh_token"]
        users_service.set_role("admin", Role.VIEWER)

        response = client.post(
            "/token",
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
        )

    assert response.status_code == 200
    data = response.json()
    assert auth_service.decode_token(data["access_token"]).role == Role.VIEWER
    assert (
        auth_service.decode_token(data["refresh_token"], expected_type="refresh").role
        == Role.VIEWER
    )


def test_token_refresh_grant_keeps_unchanged_role(app: FastAPI) -> None:
    auth_service: AuthService = app.state.auth_service
    with TestClient(app) as client:
        refresh_token = _login(client)["refresh_token"]
        response = client.post(
            "/token",
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
        )

    assert response.status_code == 200
    data = response.json()
    assert auth_service.decode_token(data["access_token"]).role == Role.ADMIN
    assert (
        auth_service.decode_token(data["refresh_token"], expected_type="refresh").role
        == Role.ADMIN
    )


def test_token_refresh_grant_deleted_user_returns_401(app: FastAPI) -> None:
    """A refresh token whose subject is gone is as good as an invalid one."""
    auth_service: AuthService = app.state.auth_service
    deleted_token = auth_service.create_refresh_token("deleted-id", Role.ADMIN)

    with TestClient(app) as client:
        invalid = client.post(
            "/token",
            data={"grant_type": "refresh_token", "refresh_token": "bad-token"},
        )
        response = client.post(
            "/token",
            data={"grant_type": "refresh_token", "refresh_token": deleted_token},
        )

    assert response.status_code == 401
    assert response.json() == invalid.json()
    assert "access_token" not in response.json()


def test_token_refresh_grant_reads_storage_once(
    app: FastAPI, users_service: MockUsersService
) -> None:
    with TestClient(app) as client:
        refresh_token = _login(client)["refresh_token"]
        users_service.get_by_id_calls = 0
        users_service.is_blocked_calls = 0

        client.post(
            "/token",
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
        )

    assert users_service.get_by_id_calls == 1
    assert users_service.is_blocked_calls == 0


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
