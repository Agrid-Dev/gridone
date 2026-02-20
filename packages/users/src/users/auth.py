"""JWT utilities without any HTTP-framework dependencies."""

from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from pydantic import BaseModel


class InvalidTokenError(ValueError):
    """Raised when a JWT is invalid or expired."""


class TokenPayload(BaseModel):
    sub: str  # user id
    exp: datetime


class AuthService:
    def __init__(
        self,
        *,
        secret_key: str,
        access_token_expire_minutes: int = 60 * 24,
    ) -> None:
        self._secret_key = secret_key
        self._access_token_expire_minutes = access_token_expire_minutes

    def create_access_token(self, user_id: str) -> str:
        expire = datetime.now(UTC) + timedelta(
            minutes=self._access_token_expire_minutes
        )
        payload = {"sub": user_id, "exp": expire}
        return jwt.encode(payload, self._secret_key, algorithm="HS256")

    def decode_token(self, token: str) -> TokenPayload:
        try:
            data = jwt.decode(token, self._secret_key, algorithms=["HS256"])
            return TokenPayload(**data)
        except JWTError as e:
            msg = "Invalid or expired token"
            raise InvalidTokenError(msg) from e


__all__ = ["AuthService", "InvalidTokenError", "TokenPayload"]
