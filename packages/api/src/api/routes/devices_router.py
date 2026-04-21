from __future__ import annotations

import logging
from datetime import datetime  # noqa: TC003
from typing import Annotated

from commands import AttributeWrite, CommandsServiceInterface, UnitCommand
from devices_manager import DevicesManagerInterface
from devices_manager.dto import StandardAttributeSchema
from devices_manager.dto.device_dto import (
    DeviceCreate,
    Device,
    DeviceUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
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
from api.routes._command_helpers import (
    resolve_attribute_data_type,
    resolve_attribute_data_type_for_target,
    to_batch_dispatch_response,
)
from api.routes.devices_timeseries_router import router as devices_ts_router
from api.routes.faults_router import router as faults_router
from api.schemas.command import (
    BatchDeviceCommand,
    BatchDispatchResponse,
    CommandsQuery,
    SingleDeviceCommand,
    get_commands_query,
)
from api.schemas.device import (
    SingleAttrTimeseriesPushPoint,
    TagValueBody,
    TimeseriesBulkPushRequest,
    TimeseriesSingleAttrPushRequest,
)
from api.schemas.pagination import PaginatedResponse, to_paginated_response

logger = logging.getLogger(__name__)


def _resolve_start(query: CommandsQuery) -> datetime | None:
    """Resolve the ``last`` duration shorthand into a ``start`` timestamp."""
    if query.last is not None and query.start is None:
        from timeseries.domain import resolve_last  # noqa: PLC0415

        return resolve_last(query.last)
    return query.start


def _parse_tags(raw: list[str] | None) -> dict[str, list[str]] | None:
    """Parse ``?tags=key:value`` query params into a tags filter dict.

    Filter semantics: AND across keys, OR within values of the same key.
    Repeat the param for OR: ``?tags=asset_id:a1&tags=asset_id:a2``.
    """
    if not raw:
        return None
    result: dict[str, list[str]] = {}
    for item in raw:
        key, _, value = item.partition(":")
        if value:
            result.setdefault(key, []).append(value)
    return result or None


router = APIRouter()
router.include_router(devices_ts_router)
router.include_router(faults_router, prefix="/faults")


@router.get("/", dependencies=[Depends(require_permission(Permission.DEVICES_READ))])
def list_devices(
    dm: DevicesManagerInterface = Depends(get_device_manager),
    types: list[str] | None = Query(None, alias="type"),
    ids: list[str] | None = Query(None),
    tags: list[str] | None = Query(None),
    is_faulty: bool | None = Query(None),
) -> list[Device]:
    parsed_tags = _parse_tags(tags)
    return dm.list_devices(ids=ids, types=types, tags=parsed_tags, is_faulty=is_faulty)


@router.get(
    "/standard-types",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
def get_standard_types(
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
) -> list[StandardAttributeSchema]:
    return dm.list_standard_schemas()


@router.get(
    "/commands",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
async def list_commands(
    request: Request,
    query: CommandsQuery = Depends(get_commands_query),
    pagination: PaginationParams = Depends(get_pagination_params),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> PaginatedResponse[UnitCommand]:
    page = await commands_svc.get_commands(
        ids=query.ids,
        batch_id=query.batch_id,
        device_id=query.device_id,
        attribute=query.attribute,
        user_id=query.user_id,
        start=_resolve_start(query),
        end=query.end,
        sort=query.sort,
        pagination=pagination,
    )
    return to_paginated_response(page, str(request.url))


@router.post(
    "/commands",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def dispatch_batch_command(
    body: BatchDeviceCommand,
    dm: DevicesManagerInterface = Depends(get_device_manager),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
    user_id: str = Depends(get_current_user_id),
) -> BatchDispatchResponse:
    target = body.target.model_dump(exclude_none=True)
    data_type = resolve_attribute_data_type_for_target(dm, target, body.attribute)
    commands = await commands_svc.dispatch_batch(
        target=target,
        write=AttributeWrite(
            attribute=body.attribute, value=body.value, data_type=data_type
        ),
        user_id=user_id,
        confirm=body.confirm,
    )
    if not commands:
        raise HTTPException(
            status_code=422,
            detail="Target resolved to no devices",
        )
    return to_batch_dispatch_response(commands)


@router.get(
    "/{device_id}", dependencies=[Depends(require_permission(Permission.DEVICES_READ))]
)
def get_device(
    device_id: str,
    dm: DevicesManagerInterface = Depends(get_device_manager),
) -> Device:
    return dm.get_device(device_id)


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


@router.put(
    "/{device_id}/tags/{key}",
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def set_device_tag(
    device_id: str,
    key: str,
    body: TagValueBody,
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
) -> Device:
    return await dm.set_device_tag(device_id, key, body.value)


@router.delete(
    "/{device_id}/tags/{key}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def delete_device_tag(
    device_id: str,
    key: str,
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
) -> None:
    await dm.delete_device_tag(device_id, key)
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


@router.get(
    "/{device_id}/commands",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
async def list_device_commands(
    device_id: str,
    request: Request,
    query: CommandsQuery = Depends(get_commands_query),
    pagination: PaginationParams = Depends(get_pagination_params),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
) -> PaginatedResponse[UnitCommand]:
    # Path parameter always wins over a query-string device_id.
    page = await commands_svc.get_commands(
        ids=query.ids,
        batch_id=query.batch_id,
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
    "/{device_id}/commands",
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def dispatch_single_command(
    device_id: str,
    body: SingleDeviceCommand,
    dm: DevicesManagerInterface = Depends(get_device_manager),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
    user_id: str = Depends(get_current_user_id),
) -> UnitCommand:
    dm.get_device(device_id)  # raises NotFoundError → 404 if unknown
    data_type = resolve_attribute_data_type(dm, [device_id], body.attribute)
    return await commands_svc.dispatch_unit(
        device_id=device_id,
        write=AttributeWrite(
            attribute=body.attribute, value=body.value, data_type=data_type
        ),
        user_id=user_id,
        confirm=body.confirm,
    )
