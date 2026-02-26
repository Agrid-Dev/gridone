"""Tests for users.auth (JWT AuthService)."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest

from users.auth import AuthService, InvalidTokenError, TokenPayload


@pytest.fixture
def auth_service() -> AuthService:
    return AuthService(secret_key="test-secret-key", access_token_expire_minutes=60)


class TestAuthService:
    def test_create_and_decode_token(self, auth_service: AuthService):
        token = auth_service.create_access_token("user-42")
        payload = auth_service.decode_token(token)
        assert payload.sub == "user-42"
        assert isinstance(payload, TokenPayload)

    def test_token_expiry_is_set(self, auth_service: AuthService):
        before = datetime.now(UTC)
        token = auth_service.create_access_token("user-1")
        payload = auth_service.decode_token(token)
        after = datetime.now(UTC)
        assert payload.exp >= before + timedelta(minutes=59)
        assert payload.exp <= after + timedelta(minutes=61)

    def test_invalid_token_raises(self, auth_service: AuthService):
        with pytest.raises(InvalidTokenError):
            auth_service.decode_token("not.a.valid.token")

    def test_wrong_secret_raises(self, auth_service: AuthService):
        token = auth_service.create_access_token("user-1")
        other = AuthService(secret_key="different-secret")
        with pytest.raises(InvalidTokenError):
            other.decode_token(token)

    def test_expired_token_raises(self, auth_service: AuthService):
        svc = AuthService(
            secret_key="test-secret-key", access_token_expire_minutes=-1
        )
        token = svc.create_access_token("user-1")
        with pytest.raises(InvalidTokenError):
            auth_service.decode_token(token)

    def test_default_expire_minutes(self):
        svc = AuthService(secret_key="key")
        assert svc._access_token_expire_minutes == 60 * 24


class TestInvalidTokenError:
    def test_is_value_error(self):
        assert issubclass(InvalidTokenError, ValueError)
