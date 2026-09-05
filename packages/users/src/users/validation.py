from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, StringConstraints

from users.password import BCRYPT_MAX_BYTES, exceeds_bcrypt_limit

USERNAME_MIN_LENGTH = 3
USERNAME_MAX_LENGTH = 64
PASSWORD_MIN_LENGTH = 5
# A string longer than the byte limit always exceeds it, so this bound is exact
# for ASCII and the validator below covers the multi-byte case.
PASSWORD_MAX_LENGTH = BCRYPT_MAX_BYTES


def _check_password_bytes(value: str) -> str:
    """Reject a password whose UTF-8 encoding exceeds bcrypt's limit."""
    if exceeds_bcrypt_limit(value):
        msg = f"Password must be at most {BCRYPT_MAX_BYTES} bytes"
        raise ValueError(msg)
    return value


UsernameField = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=USERNAME_MIN_LENGTH,
        max_length=USERNAME_MAX_LENGTH,
    ),
]
PasswordField = Annotated[
    str,
    StringConstraints(
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
    ),
    AfterValidator(_check_password_bytes),
]


class AuthPayload(BaseModel):
    """Credentials model with validation enforced via Pydantic Field.
    Schema is exported to the front for form validation (single source of truth).
    """

    username: str = Field(
        ...,
        min_length=USERNAME_MIN_LENGTH,
        max_length=USERNAME_MAX_LENGTH,
        strip_whitespace=True,
    )
    password: str = Field(
        ...,
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
    )


def get_auth_payload_schema() -> dict:
    """JSON schema of AuthPayload for frontend form (e.g. z.fromJSONSchema)."""
    return AuthPayload.model_json_schema()


__all__ = [
    "PASSWORD_MAX_LENGTH",
    "PASSWORD_MIN_LENGTH",
    "USERNAME_MAX_LENGTH",
    "USERNAME_MIN_LENGTH",
    "AuthPayload",
    "PasswordField",
    "UsernameField",
    "get_auth_payload_schema",
]
