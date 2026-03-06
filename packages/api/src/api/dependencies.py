from assets import AssetsManager
from devices_manager import DevicesManager
from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer
from models.pagination import PaginationParams
from timeseries import TimeSeriesService
from users import UsersManager
from users.auth import AuthService, InvalidTokenError

_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def get_device_manager(request: Request) -> DevicesManager:
    return request.app.state.device_manager


def get_ts_service(request: Request) -> TimeSeriesService:
    return request.app.state.ts_service


def get_users_manager(request: Request) -> UsersManager:
    return request.app.state.users_manager


def get_assets_manager(request: Request) -> AssetsManager:
    return request.app.state.assets_manager


def get_auth_service(request: Request) -> AuthService:
    return request.app.state.auth_service


async def get_current_user_id(
    request: Request,
    token: str | None = Depends(_oauth2_scheme),
    auth_service: AuthService = Depends(get_auth_service),
) -> str:
    # Authorization header (Swagger / Postman) takes precedence, then cookie
    if token is None:
        token = request.cookies.get("access_token")
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = auth_service.decode_token(token, expected_type="access")
    except InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    return payload.sub


def get_pagination_params(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
) -> PaginationParams:
    return PaginationParams(page=page, size=size)
