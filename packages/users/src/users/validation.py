from pydantic import BaseModel, Field

USERNAME_MIN_LENGTH = 3
USERNAME_MAX_LENGTH = 64
PASSWORD_MIN_LENGTH = 5
PASSWORD_MAX_LENGTH = 128


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
    "get_auth_payload_schema",
]
