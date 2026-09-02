import pytest
from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient

from api.dependencies import (
    PASSWORD_CHANGE_REQUIRED,
    get_users_service,
    require_password_changed,
)
from api.exception_handlers import register_exception_handlers
from api.routes.users.auth_router import router
from models.errors import (
    BlockedUserError,
    InvalidError,
    NotFoundError,
    UnauthorizedError,
)
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
        self._credentials = {
            "admin": "admin",
            "blocked": "blocked",
            "flagged": "flagged",
        }
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
            "flagged": User(
                id="flagged-id",
                username="flagged",
                role=Role.OPERATOR,
                must_change_password=True,
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

    async def change_password(
        self, user_id: str, current_password: str, new_password: str
    ) -> User:
        for username, user in self._users.items():
            if user.id != user_id:
                continue
            if self._credentials[username] != current_password:
                msg = "Invalid current password"
                raise UnauthorizedError(msg)
            if new_password == current_password:
                msg = "The new password must differ from the current one"
                raise InvalidError(msg)
            self._credentials[username] = new_password
            self._users[username] = user.model_copy(
                update={"must_change_password": False}
            )
            return self._users[username]
        msg = f"User '{user_id}' not found"
        raise NotFoundError(msg)

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


def _login(client: TestClient, username: str = "admin") -> dict:
    """Log in as one of the mock users, whose password equals their username."""
    return client.post(
        "/token",
        data={"grant_type": "password", "username": username, "password": username},
    ).json()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


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


# --- /password ---


def test_change_password_returns_the_updated_account(client: TestClient) -> None:
    token = _login(client, "flagged")["access_token"]

    response = client.post(
        "/password",
        json={"current_password": "flagged", "new_password": "new-password"},
        headers=_auth(token),
    )

    assert response.status_code == 200
    assert response.json()["must_change_password"] is False


def test_change_password_lets_the_new_credential_log_in(client: TestClient) -> None:
    token = _login(client, "flagged")["access_token"]
    client.post(
        "/password",
        json={"current_password": "flagged", "new_password": "new-password"},
        headers=_auth(token),
    )

    response = client.post(
        "/token",
        data={
            "grant_type": "password",
            "username": "flagged",
            "password": "new-password",
        },
    )
    assert response.status_code == 200


@pytest.mark.parametrize(
    "current_password",
    [
        pytest.param("not-my-password", id="wrong"),
        # Shorter than PASSWORD_MIN_LENGTH: still 401, never a 422 that would
        # reveal which check failed.
        pytest.param("no", id="wrong-and-short"),
    ],
)
def test_change_password_wrong_current_returns_generic_401(
    client: TestClient, current_password: str
) -> None:
    token = _login(client, "flagged")["access_token"]

    response = client.post(
        "/password",
        json={"current_password": current_password, "new_password": "new-password"},
        headers=_auth(token),
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Unauthorized"}


def test_change_password_rejects_reusing_the_current_password(
    client: TestClient,
) -> None:
    token = _login(client, "flagged")["access_token"]

    response = client.post(
        "/password",
        json={"current_password": "flagged", "new_password": "flagged"},
        headers=_auth(token),
    )

    assert response.status_code == 422


def test_change_password_requires_a_token(client: TestClient) -> None:
    response = client.post(
        "/password",
        json={"current_password": "flagged", "new_password": "new-password"},
    )
    assert response.status_code == 401


@pytest.mark.parametrize(
    "new_password",
    [
        pytest.param("a" * (PASSWORD_MAX_LENGTH + 1), id="ascii-over-limit"),
        # 40 characters, 80 bytes once encoded.
        pytest.param("é" * 40, id="multibyte-over-limit"),
        pytest.param("a" * (PASSWORD_MIN_LENGTH - 1), id="under-minimum"),
    ],
)
def test_change_password_rejects_out_of_range_password(
    client: TestClient, new_password: str
) -> None:
    token = _login(client, "flagged")["access_token"]

    response = client.post(
        "/password",
        json={"current_password": "flagged", "new_password": new_password},
        headers=_auth(token),
    )

    assert response.status_code == 422


# --- must_change_password gate ---


@pytest.fixture
def gated_app(users_service: MockUsersService) -> FastAPI:
    """Mirror app.py's split: auth_router public, one router behind the gate."""
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key="test-secret")
    app.state.cookie_secure = False
    app.dependency_overrides[get_users_service] = lambda: users_service
    register_exception_handlers(app)
    app.include_router(router)

    protected = APIRouter()

    @protected.get("/")
    async def _protected() -> dict:
        return {"ok": True}

    app.include_router(
        protected,
        prefix="/protected",
        dependencies=[Depends(require_password_changed)],
    )
    return app


@pytest.fixture
def gated_client(gated_app: FastAPI) -> TestClient:
    return TestClient(gated_app)


def test_flagged_user_is_refused_on_a_protected_route(gated_client: TestClient) -> None:
    token = _login(gated_client, "flagged")["access_token"]

    response = gated_client.get("/protected/", headers=_auth(token))

    assert response.status_code == 403
    assert response.json() == {"detail": PASSWORD_CHANGE_REQUIRED}


def test_flagged_user_still_reaches_me(gated_client: TestClient) -> None:
    token = _login(gated_client, "flagged")["access_token"]

    assert gated_client.get("/me", headers=_auth(token)).status_code == 200


def test_same_token_works_after_the_password_change(gated_client: TestClient) -> None:
    """No re-login: the gate reads storage, not the token."""
    token = _login(gated_client, "flagged")["access_token"]
    assert gated_client.get("/protected/", headers=_auth(token)).status_code == 403

    gated_client.post(
        "/password",
        json={"current_password": "flagged", "new_password": "new-password"},
        headers=_auth(token),
    )

    assert gated_client.get("/protected/", headers=_auth(token)).status_code == 200


def test_unflagged_user_passes_the_gate(gated_client: TestClient) -> None:
    token = _login(gated_client, "admin")["access_token"]

    assert gated_client.get("/protected/", headers=_auth(token)).status_code == 200


def test_gate_still_refuses_an_unauthenticated_request(
    gated_client: TestClient,
) -> None:
    assert gated_client.get("/protected/").status_code == 401


def test_gate_still_refuses_a_blocked_user(gated_app: FastAPI) -> None:
    auth_service: AuthService = gated_app.state.auth_service
    token = auth_service.create_access_token("blocked-id", Role.OPERATOR)

    with TestClient(gated_app) as client:
        response = client.get("/protected/", headers=_auth(token))

    assert response.status_code == 403
    assert "blocked" in response.json()["detail"].lower()
