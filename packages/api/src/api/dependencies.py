from assets import AssetsManager
from devices_manager import DevicesManager
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from timeseries import TimeSeriesService
from users import AuthorizationService, Permission, UsersManager
from users.auth import AuthService, InvalidTokenError
from users.roles_manager import RolesManager

_bearer = HTTPBearer()


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


def get_authorization_service(request: Request) -> AuthorizationService:
    return request.app.state.authorization_service


def get_roles_manager(request: Request) -> RolesManager:
    return request.app.state.roles_manager


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


# ── Permission dependency factories ───────────────────────────────────


def require_permission(permission: Permission):
    """Dependency factory: raises 403 if user lacks the given permission (unscoped)."""

    async def _check(
        user_id: str = Depends(get_current_user_id),
        authz: AuthorizationService = Depends(get_authorization_service),
    ) -> str:
        has_perm = await authz.check_permission(user_id, permission)
        if not has_perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission}",
            )
        return user_id

    return _check


def require_device_permission(permission: Permission):
    """Dependency factory for routes with a ``device_id`` path parameter."""

    async def _check(
        device_id: str,
        user_id: str = Depends(get_current_user_id),
        authz: AuthorizationService = Depends(get_authorization_service),
    ) -> str:
        has_perm = await authz.check_device_permission(user_id, permission, device_id)
        if not has_perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission}",
            )
        return user_id

    return _check


def require_asset_permission(permission: Permission):
    """Dependency factory for routes with an ``asset_id`` path parameter."""

    async def _check(
        asset_id: str,
        user_id: str = Depends(get_current_user_id),
        authz: AuthorizationService = Depends(get_authorization_service),
    ) -> str:
        has_perm = await authz.check_permission(user_id, permission, asset_id)
        if not has_perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission}",
            )
        return user_id

    return _check
