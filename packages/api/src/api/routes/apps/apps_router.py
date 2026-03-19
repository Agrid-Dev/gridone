from typing import Annotated

from apps import App, AppsManager
from fastapi import APIRouter, Depends, HTTPException, status
from models.errors import NotFoundError
from pydantic import BaseModel

from api.dependencies import get_apps_manager, require_permission
from api.permissions import Permission

router = APIRouter()


class AppResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: str
    api_url: str
    health_url: str
    icon: str
    status: str
    created_at: str


def _to_app_response(app: App) -> AppResponse:
    return AppResponse(
        id=app.id,
        user_id=app.user_id,
        name=app.name,
        description=app.description,
        api_url=app.api_url,
        health_url=app.health_url,
        icon=app.icon,
        status=app.status,
        created_at=app.created_at.isoformat(),
    )


@router.get(
    "/",
    response_model=list[AppResponse],
)
async def list_apps(
    am: Annotated[AppsManager, Depends(get_apps_manager)],
) -> list[AppResponse]:
    apps = await am.list_apps()
    return [_to_app_response(a) for a in apps]


@router.get(
    "/{app_id}",
    response_model=AppResponse,
)
async def get_app(
    app_id: str,
    am: Annotated[AppsManager, Depends(get_apps_manager)],
) -> AppResponse:
    try:
        app = await am.get_app(app_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return _to_app_response(app)


@router.post(
    "/{app_id}/enable",
    response_model=AppResponse,
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def enable_app(
    app_id: str,
    am: Annotated[AppsManager, Depends(get_apps_manager)],
) -> AppResponse:
    try:
        app = await am.enable_app(app_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return _to_app_response(app)


@router.post(
    "/{app_id}/disable",
    response_model=AppResponse,
    dependencies=[Depends(require_permission(Permission.USERS_WRITE))],
)
async def disable_app(
    app_id: str,
    am: Annotated[AppsManager, Depends(get_apps_manager)],
) -> AppResponse:
    try:
        app = await am.disable_app(app_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return _to_app_response(app)
