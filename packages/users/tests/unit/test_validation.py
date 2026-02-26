"""Tests for users.validation."""

import pytest
from pydantic import ValidationError

from users.validation import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
    AuthPayload,
    get_auth_payload_schema,
)


class TestAuthPayload:
    def test_valid_payload(self):
        payload = AuthPayload(username="alice", password="secret123")
        assert payload.username == "alice"
        assert payload.password == "secret123"

    def test_username_too_short(self):
        with pytest.raises(ValidationError):
            AuthPayload(username="ab", password="secret123")

    def test_username_too_long(self):
        with pytest.raises(ValidationError):
            AuthPayload(username="a" * (USERNAME_MAX_LENGTH + 1), password="secret123")

    def test_password_too_short(self):
        with pytest.raises(ValidationError):
            AuthPayload(username="alice", password="1234")

    def test_password_too_long(self):
        with pytest.raises(ValidationError):
            AuthPayload(username="alice", password="x" * (PASSWORD_MAX_LENGTH + 1))

    def test_username_whitespace_preserved(self):
        # strip_whitespace on Field is deprecated in Pydantic V2 and has no effect
        payload = AuthPayload(username="  alice  ", password="secret123")
        assert payload.username == "  alice  "

    def test_boundary_lengths(self):
        AuthPayload(
            username="a" * USERNAME_MIN_LENGTH,
            password="p" * PASSWORD_MIN_LENGTH,
        )
        AuthPayload(
            username="a" * USERNAME_MAX_LENGTH,
            password="p" * PASSWORD_MAX_LENGTH,
        )


class TestGetAuthPayloadSchema:
    def test_returns_dict(self):
        schema = get_auth_payload_schema()
        assert isinstance(schema, dict)

    def test_has_properties(self):
        schema = get_auth_payload_schema()
        assert "properties" in schema
        assert "username" in schema["properties"]
        assert "password" in schema["properties"]
