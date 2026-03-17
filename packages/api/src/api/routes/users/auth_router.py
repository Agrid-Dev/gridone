from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from models.errors import BlockedUserError

from users import UsersManager
from users.auth import AuthService, InvalidTokenError
from users.models import Role
from users.validation import get_auth_payload_schema
from api.dependencies import (
    get_auth_service,
    get_current_user_id,
    get_users_manager,
)
from api.permissions import get_permissions_for_role

router = APIRouter()


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


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


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    um: Annotated[UsersManager, Depends(get_users_manager)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenResponse:
    try:
        user = await um.authenticate(form_data.username, form_data.password)
    except BlockedUserError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been blocked. Contact an administrator.",
        )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth_service.create_access_token(user.id, user.role)
    refresh_token = auth_service.create_refresh_token(user.id, user.role)

    _set_token_cookies(
        response,
        access_token,
        refresh_token,
        access_max_age=auth_service._access_token_expire_minutes * 60,
        refresh_max_age=auth_service._refresh_token_expire_minutes * 60,
        secure=request.app.state.cookie_secure,
    )

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    auth_service: AuthService = Depends(get_auth_service),
    um: UsersManager = Depends(get_users_manager),
) -> TokenResponse:
    # Cookie takes precedence; fall back to JSON body (for Postman/Swagger)
    token = request.cookies.get("refresh_token")
    if not token and body:
        token = body.refresh_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

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

    access_token = auth_service.create_access_token(payload.sub, payload.role)
    refresh_token = auth_service.create_refresh_token(payload.sub, payload.role)

    _set_token_cookies(
        response,
        access_token,
        refresh_token,
        access_max_age=auth_service._access_token_expire_minutes * 60,
        refresh_max_age=auth_service._refresh_token_expire_minutes * 60,
        secure=request.app.state.cookie_secure,
    )

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


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


@router.get("/me", response_model=MeResponse)
async def get_me(
    current_user_id: Annotated[str, Depends(get_current_user_id)],
    um: Annotated[UsersManager, Depends(get_users_manager)],
) -> MeResponse:
    user = await um.get_by_id(current_user_id)
    return MeResponse(
        **user.model_dump(),
        permissions=get_permissions_for_role(user.role),
    )
