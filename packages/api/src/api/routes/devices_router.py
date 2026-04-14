from __future__ import annotations

import logging
from datetime import datetime  # noqa: TC003
from typing import Annotated

from commands import Command, CommandsServiceInterface
from devices_manager import DevicesManagerInterface
from devices_manager.dto import StandardAttributeSchema
from devices_manager.dto.device_dto import (
    DeviceCreate,
    Device,
    DeviceUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from models.errors import InvalidError, NotFoundError
from models.pagination import PaginationParams
from timeseries.domain import (
    DataPoint,
    SeriesKey,
)
from timeseries.service import TimeSeriesService

from api.dependencies import (
    get_commands_service,
    get_current_user_id,
    get_device_manager,
    get_pagination_params,
    get_ts_service,
    require_permission,
)
from api.permissions import Permission
from api.routes.devices_timeseries_router import router as devices_ts_router
from api.schemas.device import (
    AttributeUpdate,
    CommandsQuery,
    SingleAttrTimeseriesPushPoint,
    TimeseriesBulkPushRequest,
    TimeseriesSingleAttrPushRequest,
    get_commands_query,
)
from api.schemas.pagination import PaginatedResponse, to_paginated_response

logger = logging.getLogger(__name__)


def _resolve_start(query: CommandsQuery) -> datetime | None:
    """Resolve the ``last`` duration shorthand into a ``start`` timestamp."""
    if query.last is not None and query.start is None:
        from timeseries.domain import resolve_last  # noqa: PLC0415

        return resolve_last(query.last)
    return query.start


router = APIRouter()
router.include_router(devices_ts_router)


@router.get("/", dependencies=[Depends(require_permission(Permission.DEVICES_READ))])
def list_devices(
    dm: DevicesManagerInterface = Depends(get_device_manager),
    device_type: str | None = Query(None, alias="type"),
) -> list[Device]:
    return dm.list_devices(device_type=device_type)


@router.get(
    "/standard-types",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
def get_standard_types(
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
) -> list[StandardAttributeSchema]:
    return dm.list_standard_schemas()


@router.get(
    "/commands", dependencies=[Depends(require_permission(Permission.DEVICES_READ))]
)
async def get_commands(
    request: Request,
    query: CommandsQuery = Depends(get_commands_query),
    pagination: PaginationParams = Depends(get_pagination_params),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> PaginatedResponse[Command]:
    page = await commands_svc.get_commands(
        ids=query.ids,
        device_id=query.device_id,
        attribute=query.attribute,
        user_id=query.user_id,
        start=_resolve_start(query),
        end=query.end,
        sort=query.sort,
        pagination=pagination,
    )
    return to_paginated_response(page, str(request.url))


@router.get(
    "/{device_id}", dependencies=[Depends(require_permission(Permission.DEVICES_READ))]
)
def get_device(
    device_id: str,
    dm: DevicesManagerInterface = Depends(get_device_manager),
) -> Device:
    return dm.get_device(device_id)


@router.get(
    "/{device_id}/commands",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
async def get_device_commands(
    device_id: str,
    request: Request,
    query: CommandsQuery = Depends(get_commands_query),
    pagination: PaginationParams = Depends(get_pagination_params),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> PaginatedResponse[Command]:
    page = await commands_svc.get_commands(
        ids=query.ids,
        device_id=device_id,
        attribute=query.attribute,
        user_id=query.user_id,
        start=_resolve_start(query),
        end=query.end,
        sort=query.sort,
        pagination=pagination,
    )
    return to_paginated_response(page, str(request.url))


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def create_device(
    dto: DeviceCreate,
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
) -> Device:
    return await dm.add_device(dto)


@router.patch(
    "/{device_id}", dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))]
)
async def update_device(
    device_id: str,
    payload: DeviceUpdate,
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
) -> Device:
    try:
        device = await dm.update_device(device_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return device


@router.delete(
    "/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def delete_device(
    device_id: str,
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
):
    await dm.delete_device(device_id)
    return


def _to_data_points(points: list[SingleAttrTimeseriesPushPoint]) -> list[DataPoint]:
    return [DataPoint(timestamp=p.timestamp, value=p.value) for p in points]


@router.post(
    "/{device_id}/timeseries",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def push_device_timeseries(
    device_id: str,
    body: TimeseriesBulkPushRequest,
    dm: DevicesManagerInterface = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> None:
    device_dto = dm.get_device(device_id)
    for p in body.data:
        if p.attribute not in device_dto.attributes:
            raise HTTPException(
                status_code=404,
                detail=f"Attribute '{p.attribute}' not found on device {device_id}",
            )
    grouped: dict[str, list[DataPoint]] = {}
    for p in body.data:
        grouped.setdefault(p.attribute, []).append(
            DataPoint(timestamp=p.timestamp, value=p.value)
        )
    for attr_name, points in grouped.items():
        await ts.upsert_points(
            SeriesKey(owner_id=device_id, metric=attr_name),
            points,
            create_if_not_found=True,
            validate_data_type=device_dto.attributes[attr_name].data_type,
        )


@router.post(
    "/{device_id}/timeseries/{attr_name}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def push_device_attribute_timeseries(
    device_id: str,
    attr_name: str,
    body: TimeseriesSingleAttrPushRequest,
    dm: DevicesManagerInterface = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> None:
    device_dto = dm.get_device(device_id)
    if attr_name not in device_dto.attributes:
        raise HTTPException(
            status_code=404,
            detail=f"Attribute '{attr_name}' not found on device {device_id}",
        )
    points = _to_data_points(body.data)
    await ts.upsert_points(
        SeriesKey(owner_id=device_id, metric=attr_name),
        points,
        create_if_not_found=True,
        validate_data_type=device_dto.attributes[attr_name].data_type,
    )


@router.post(
    "/{device_id}/{attribute_name}",
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def update_attribute(
    device_id: str,
    attribute_name: str,
    update: AttributeUpdate,
    confirm: bool = True,
    dm: DevicesManagerInterface = Depends(get_device_manager),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
    user_id: str = Depends(get_current_user_id),
) -> AttributeUpdate:
    data_type = dm.get_device(device_id).attributes[attribute_name].data_type

    try:
        await commands_svc.dispatch(
            device_id=device_id,
            attribute=attribute_name,
            value=update.value,
            data_type=data_type,
            user_id=user_id,
            confirm=confirm,
        )
    except (TypeError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (NotFoundError, InvalidError):
        raise
    return update
