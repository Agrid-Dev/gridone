"""JWT utilities without any HTTP-framework dependencies."""

from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from pydantic import BaseModel

_ACCESS = "access"
_REFRESH = "refresh"


class InvalidTokenError(ValueError):
    """Raised when a JWT is invalid or expired."""


class TokenPayload(BaseModel):
    sub: str  # user id
    role: str = ""
    exp: datetime
    type: str = _ACCESS


class AuthService:
    def __init__(
        self,
        *,
        secret_key: str,
        access_token_expire_minutes: int = 30,
        refresh_token_expire_minutes: int = 60 * 24 * 7,
    ) -> None:
        self._secret_key = secret_key
        self._access_token_expire_minutes = access_token_expire_minutes
        self._refresh_token_expire_minutes = refresh_token_expire_minutes

    def _create_token(
        self, user_id: str, *, role: str, kind: str, expire_minutes: int
    ) -> str:
        expire = datetime.now(UTC) + timedelta(minutes=expire_minutes)
        payload = {"sub": user_id, "role": role, "exp": expire, "type": kind}
        return jwt.encode(payload, self._secret_key, algorithm="HS256")

    def create_access_token(self, user_id: str, role: str) -> str:
        return self._create_token(
            user_id,
            role=role,
            kind=_ACCESS,
            expire_minutes=self._access_token_expire_minutes,
        )

    def create_refresh_token(self, user_id: str, role: str) -> str:
        return self._create_token(
            user_id,
            role=role,
            kind=_REFRESH,
            expire_minutes=self._refresh_token_expire_minutes,
        )

    def decode_token(self, token: str, *, expected_type: str = _ACCESS) -> TokenPayload:
        try:
            data = jwt.decode(token, self._secret_key, algorithms=["HS256"])
            payload = TokenPayload(**data)
        except JWTError as e:
            msg = "Invalid or expired token"
            raise InvalidTokenError(msg) from e
        else:
            if payload.type != expected_type:
                msg = f"Expected {expected_type} token, got {payload.type}"
                raise InvalidTokenError(msg)
            return payload


__all__ = ["AuthService", "InvalidTokenError", "TokenPayload"]
