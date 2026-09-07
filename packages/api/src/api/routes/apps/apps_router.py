from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, status
from pydantic import BaseModel

from api.auth import require_permission
from api.dependencies import get_apps_service
from api.permissions import Permission
from apps import App, AppsService, PushStatus

router = APIRouter()


class AppConfigResult(BaseModel):
    config: dict[str, Any]
    push_status: PushStatus | None


@router.get(
    "/",
)
async def list_apps(
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> list[App]:
    return await service.list_apps()


@router.get(
    "/{app_id}",
)
async def get_app(
    app_id: str,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> App:
    return await service.get_app(app_id)


@router.get(
    "/{app_id}/config/schema",
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def get_config_schema(
    app_id: str,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> dict:
    return await service.get_config_schema(app_id)


@router.get(
    "/{app_id}/config",
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def get_config(
    app_id: str,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> dict:
    return await service.get_config(app_id)


@router.patch(
    "/{app_id}/config",
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
    responses={
        status.HTTP_422_UNPROCESSABLE_CONTENT: {"description": "Invalid config"},
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "App is unreachable or served an invalid config schema"
        },
    },
)
async def update_config(
    app_id: str,
    config: Annotated[dict[str, Any], Body()],
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> AppConfigResult:
    app = await service.update_config(app_id, config)
    return AppConfigResult(config=app.config or {}, push_status=app.push_status)


@router.post(
    "/{app_id}/enable",
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def enable_app(
    app_id: str,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> App:
    return await service.enable_app(app_id)


@router.post(
    "/{app_id}/disable",
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def disable_app(
    app_id: str,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> App:
    return await service.disable_app(app_id)
