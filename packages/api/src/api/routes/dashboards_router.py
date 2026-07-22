from __future__ import annotations

from typing import Annotated, Any

from dashboards import (
    Dashboard,
    DashboardCreate,
    DashboardPatch,
    DashboardsServiceInterface,
    DashboardSummary,
    LayoutItem,
    Widget,
)
from fastapi import APIRouter, Depends, status

from api.dependencies import get_dashboards_service, require_permission
from api.permissions import Permission
from api.schemas.dashboard import WidgetCreateBody, WidgetUpdateBody

router = APIRouter()

_ServiceDep = Annotated[DashboardsServiceInterface, Depends(get_dashboards_service)]


# ``/widget-schemas`` is declared before ``/{dashboard_id}`` so the literal path
# isn't captured by the id path parameter.
@router.get(
    "/widget-schemas",
    dependencies=[Depends(require_permission(Permission.DASHBOARDS_READ))],
)
def get_widget_schemas(svc: _ServiceDep) -> dict[str, dict[str, Any]]:
    return svc.widget_schemas()


@router.get(
    "/",
    response_model=list[DashboardSummary],
    dependencies=[Depends(require_permission(Permission.DASHBOARDS_READ))],
)
async def list_dashboards(svc: _ServiceDep) -> list[DashboardSummary]:
    return (await svc.list()).items


@router.post(
    "/",
    response_model=Dashboard,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.DASHBOARDS_WRITE))],
)
async def create_dashboard(body: DashboardCreate, svc: _ServiceDep) -> Dashboard:
    return await svc.create(body)


@router.get(
    "/{dashboard_id}",
    response_model=Dashboard,
    dependencies=[Depends(require_permission(Permission.DASHBOARDS_READ))],
)
async def get_dashboard(dashboard_id: str, svc: _ServiceDep) -> Dashboard:
    return await svc.get(dashboard_id)


@router.put(
    "/{dashboard_id}",
    response_model=Dashboard,
    dependencies=[Depends(require_permission(Permission.DASHBOARDS_WRITE))],
)
async def update_dashboard(
    dashboard_id: str, body: DashboardPatch, svc: _ServiceDep
) -> Dashboard:
    return await svc.update(dashboard_id, body)


@router.delete(
    "/{dashboard_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DASHBOARDS_WRITE))],
)
async def delete_dashboard(dashboard_id: str, svc: _ServiceDep) -> None:
    await svc.delete(dashboard_id)


@router.post(
    "/{dashboard_id}/widgets",
    response_model=Widget,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.DASHBOARDS_WRITE))],
)
async def add_widget(
    dashboard_id: str, body: WidgetCreateBody, svc: _ServiceDep
) -> Widget:
    return await svc.add_widget(
        dashboard_id,
        config=body.config.model_dump(),
        title=body.title,
        description=body.description,
    )


@router.put(
    "/{dashboard_id}/widgets/{widget_id}",
    response_model=Widget,
    dependencies=[Depends(require_permission(Permission.DASHBOARDS_WRITE))],
)
async def update_widget(
    dashboard_id: str, widget_id: str, body: WidgetUpdateBody, svc: _ServiceDep
) -> Widget:
    return await svc.update_widget(dashboard_id, widget_id, body.to_patch())


@router.delete(
    "/{dashboard_id}/widgets/{widget_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DASHBOARDS_WRITE))],
)
async def remove_widget(dashboard_id: str, widget_id: str, svc: _ServiceDep) -> None:
    await svc.remove_widget(dashboard_id, widget_id)


@router.put(
    "/{dashboard_id}/layout",
    response_model=Dashboard,
    dependencies=[Depends(require_permission(Permission.DASHBOARDS_WRITE))],
)
async def update_layout(
    dashboard_id: str, items: list[LayoutItem], svc: _ServiceDep
) -> Dashboard:
    return await svc.update_layout(dashboard_id, items)
