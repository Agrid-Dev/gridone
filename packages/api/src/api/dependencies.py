from devices_manager import DevicesManager
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from timeseries import TimeSeriesService
from users import UsersManager
from users.auth import AuthService, InvalidTokenError

_bearer = HTTPBearer()


def get_device_manager(request: Request) -> DevicesManager:
    return request.app.state.device_manager


def get_ts_service(request: Request) -> TimeSeriesService:
    return request.app.state.ts_service


def get_users_manager(request: Request) -> UsersManager:
    return request.app.state.users_manager


def get_auth_service(request: Request) -> AuthService:
    return request.app.state.auth_service


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    auth_service: AuthService = Depends(get_auth_service),
) -> str:
    try:
        payload = auth_service.decode_token(credentials.credentials)
    except InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    return payload.sub
