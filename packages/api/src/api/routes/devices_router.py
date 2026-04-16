from __future__ import annotations

import logging
from typing import Annotated

from commands import Command, CommandsServiceInterface
from devices_manager import DevicesManagerInterface
from devices_manager.dto import StandardAttributeSchema
from devices_manager.dto.device_dto import (
    DeviceCreate,
    Device,
    DeviceUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from timeseries.domain import (
    DataPoint,
    SeriesKey,
)
from timeseries.service import TimeSeriesService

from api.dependencies import (
    get_commands_service,
    get_current_user_id,
    get_device_manager,
    get_ts_service,
    require_permission,
)
from api.permissions import Permission
from api.routes._command_helpers import resolve_attribute_data_type
from api.routes.devices_timeseries_router import router as devices_ts_router
from api.schemas.command import (
    BatchDeviceCommand,
    BatchDispatchResponse,
    SingleDeviceCommand,
)
from api.schemas.device import (
    SingleAttrTimeseriesPushPoint,
    TimeseriesBulkPushRequest,
    TimeseriesSingleAttrPushRequest,
)

logger = logging.getLogger(__name__)


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
    data_type = resolve_attribute_data_type(dm, body.device_ids, body.attribute)
    group_id, total = await commands_svc.dispatch_batch(
        device_ids=body.device_ids,
        attribute=body.attribute,
        value=body.value,
        data_type=data_type,
        user_id=user_id,
        confirm=body.confirm,
    )
    return BatchDispatchResponse(group_id=group_id, total=total)


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
    "/{device_id}/commands",
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def dispatch_single_command(
    device_id: str,
    body: SingleDeviceCommand,
    dm: DevicesManagerInterface = Depends(get_device_manager),
    commands_svc: CommandsServiceInterface = Depends(get_commands_service),
    user_id: str = Depends(get_current_user_id),
) -> Command:
    dm.get_device(device_id)  # raises NotFoundError → 404 if unknown
    data_type = resolve_attribute_data_type(dm, [device_id], body.attribute)
    return await commands_svc.dispatch(
        device_id=device_id,
        attribute=body.attribute,
        value=body.value,
        data_type=data_type,
        user_id=user_id,
        confirm=body.confirm,
    )
