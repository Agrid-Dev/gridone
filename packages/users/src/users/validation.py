from pydantic import BaseModel

USERNAME_MIN_LENGTH = 3
USERNAME_MAX_LENGTH = 64
PASSWORD_MIN_LENGTH = 5
PASSWORD_MAX_LENGTH = 128


class AuthValidationRules(BaseModel):
    username_min_length: int = USERNAME_MIN_LENGTH
    username_max_length: int = USERNAME_MAX_LENGTH
    password_min_length: int = PASSWORD_MIN_LENGTH
    password_max_length: int = PASSWORD_MAX_LENGTH


def get_auth_validation_rules() -> AuthValidationRules:
    return AuthValidationRules()


__all__ = [
    "PASSWORD_MAX_LENGTH",
    "PASSWORD_MIN_LENGTH",
    "USERNAME_MAX_LENGTH",
    "USERNAME_MIN_LENGTH",
    "AuthValidationRules",
    "get_auth_validation_rules",
]
