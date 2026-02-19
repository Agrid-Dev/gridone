"""JWT authentication utilities shared across all API routes."""

from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from api.settings import load_settings

_bearer = HTTPBearer()

ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours


class TokenPayload(BaseModel):
    sub: str  # user id
    exp: datetime


def _get_secret() -> str:
    settings = load_settings()
    return settings.secret_key


def create_access_token(user_id: str) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, _get_secret(), algorithm="HS256")


def _decode_token(token: str) -> TokenPayload:
    try:
        data = jwt.decode(token, _get_secret(), algorithms=["HS256"])
        return TokenPayload(**data)
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


def get_users_manager(request: Request):
    from users import UsersManager

    return request.app.state.users_manager


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> str:
    payload = _decode_token(credentials.credentials)
    return payload.sub


__all__ = [
    "create_access_token",
    "get_current_user_id",
    "get_users_manager",
]
