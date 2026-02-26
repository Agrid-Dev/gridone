import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_users_manager
from api.routes.users.auth_router import router
from users import User
from users.auth import AuthService
from users.validation import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
)


class MockUsersManager:
    def __init__(self) -> None:
        self._credentials = {"admin": "admin"}
        self._users = {
            "admin": User(
                id="admin-id",
                username="admin",
            )
        }

    async def authenticate(self, username: str, password: str) -> User | None:
        if self._credentials.get(username) != password:
            return None
        return self._users[username]

    async def get_by_id(self, user_id: str) -> User:
        for user in self._users.values():
            if user.id == user_id:
                return user
        msg = f"User '{user_id}' not found"
        raise RuntimeError(msg)


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.state.auth_service = AuthService(secret_key="test-secret")
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
        json={
            "username": "x" * USERNAME_MIN_LENGTH,
            "password": "x" * PASSWORD_MIN_LENGTH,
        },
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password"}


def test_login_password_min_length_is_enforced(client: TestClient) -> None:
    response = client.post(
        "/login",
        json={
            "username": "admin",
            "password": "x" * (PASSWORD_MIN_LENGTH - 1),
        },
    )
    assert response.status_code == 422
