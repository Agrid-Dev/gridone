from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response, status
from pydantic import BaseModel

from api.dependencies import (
    get_auth_service,
    get_current_user_id,
    get_users_service,
)
from api.permissions import get_permissions_for_role
from users import UsersService
from users.auth import AuthService, InvalidTokenError
from users.models import Role
from users.validation import get_auth_payload_schema

router = APIRouter()


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


def _set_token_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    *,
    access_max_age: int,
    refresh_max_age: int,
    secure: bool,
) -> None:
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=access_max_age,
        path="/",
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=refresh_max_age,
        path="/",
    )


def _clear_token_cookies(response: Response, *, secure: bool) -> None:
    response.delete_cookie(
        "access_token", httponly=True, secure=secure, samesite="lax", path="/"
    )
    response.delete_cookie(
        "refresh_token", httponly=True, secure=secure, samesite="lax", path="/"
    )


def _build_token_response(
    access_token: str, refresh_token: str, auth_service: AuthService
) -> TokenResponse:
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=auth_service.access_token_ttl_seconds,
    )


def _apply_token_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    auth_service: AuthService,
    *,
    secure: bool,
) -> None:
    _set_token_cookies(
        response,
        access_token,
        refresh_token,
        access_max_age=auth_service.access_token_ttl_seconds,
        refresh_max_age=auth_service.refresh_token_ttl_seconds,
        secure=secure,
    )


async def _tokens_for_credentials(
    username: str, password: str, um: UsersService, auth_service: AuthService
) -> tuple[str, str]:
    user = await um.authenticate(username, password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return auth_service.create_access_token(
        user.id, user.role
    ), auth_service.create_refresh_token(user.id, user.role)


async def _tokens_for_refresh(
    token: str, um: UsersService, auth_service: AuthService
) -> tuple[str, str]:
    try:
        payload = auth_service.decode_token(token, expected_type="refresh")
    except InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    if await um.is_blocked(payload.sub):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been blocked. Contact an administrator.",
        )
    return auth_service.create_access_token(
        payload.sub, payload.role
    ), auth_service.create_refresh_token(payload.sub, payload.role)


@router.post("/token")
async def oauth2_token(
    request: Request,
    response: Response,
    grant_type: Annotated[str, Form()],
    username: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
    refresh_token: Annotated[str | None, Form()] = None,
    um: UsersService = Depends(get_users_service),
    auth_service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    if grant_type == "password":
        if not username or not password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="username and password are required",
            )
        access, new_refresh = await _tokens_for_credentials(
            username, password, um, auth_service
        )
    elif grant_type == "refresh_token":
        token = refresh_token or request.cookies.get("refresh_token")
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        access, new_refresh = await _tokens_for_refresh(token, um, auth_service)
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported grant_type: {grant_type}",
        )
    _apply_token_cookies(
        response,
        access,
        new_refresh,
        auth_service,
        secure=request.app.state.cookie_secure,
    )
    return _build_token_response(access, new_refresh, auth_service)


@router.post("/logout")
async def logout(request: Request, response: Response) -> dict:
    _clear_token_cookies(response, secure=request.app.state.cookie_secure)
    return {"detail": "Logged out"}


@router.get("/schema")
async def get_auth_schema() -> dict:
    """JSON schema of AuthPayload for frontend form validation (e.g. z.fromJSONSchema)."""
    return get_auth_payload_schema()


class MeResponse(BaseModel):
    id: str
    username: str
    role: Role
    name: str
    email: str
    title: str
    must_change_password: bool
    permissions: list[str]


@router.get("/me")
async def get_me(
    current_user_id: Annotated[str, Depends(get_current_user_id)],
    um: Annotated[UsersService, Depends(get_users_service)],
) -> MeResponse:
    user = await um.get_by_id(current_user_id)
    return MeResponse(
        **user.model_dump(),
        permissions=get_permissions_for_role(user.role),
    )
