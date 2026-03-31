from typing import Annotated, Any

from apps import App, AppsService
from fastapi import APIRouter, Body, Depends

from api.dependencies import get_apps_service, require_permission
from api.permissions import Permission

router = APIRouter()


@router.get(
    "/",
    response_model=list[App],
)
async def list_apps(
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> list[App]:
    return await service.apps.list_apps()


@router.get(
    "/{app_id}",
    response_model=App,
)
async def get_app(
    app_id: str,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> App:
    return await service.apps.get_app(app_id)


@router.get(
    "/{app_id}/config/schema",
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def get_config_schema(
    app_id: str,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> dict:
    return await service.apps.get_config_schema(app_id)


@router.get(
    "/{app_id}/config",
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def get_config(
    app_id: str,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> dict:
    return await service.apps.get_config(app_id)


@router.patch(
    "/{app_id}/config",
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def update_config(
    app_id: str,
    config: Annotated[dict[str, Any], Body()],
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> dict:
    return await service.apps.update_config(app_id, config)


@router.post(
    "/{app_id}/enable",
    response_model=App,
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def enable_app(
    app_id: str,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> App:
    return await service.apps.enable_app(app_id)


@router.post(
    "/{app_id}/disable",
    response_model=App,
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def disable_app(
    app_id: str,
    service: Annotated[AppsService, Depends(get_apps_service)],
) -> App:
    return await service.apps.disable_app(app_id)
