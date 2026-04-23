from __future__ import annotations

import logging
from typing import Annotated

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
    get_device_manager,
    get_ts_service,
    require_permission,
)
from api.devices_filter import to_list_devices_kwargs
from api.permissions import Permission
from api.routes.command_router import router as command_router
from api.routes.devices_timeseries_router import router as devices_ts_router
from api.routes.faults_router import router as faults_router
from api.schemas.device import (
    SingleAttrTimeseriesPushPoint,
    TagValueBody,
    TimeseriesBulkPushRequest,
    TimeseriesSingleAttrPushRequest,
)

logger = logging.getLogger(__name__)


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
# Command dispatch + templates live in their own router but are mounted
# under /devices so URLs stay device-scoped (``/devices/commands``,
# ``/devices/{id}/commands``, ``/devices/command-templates/...``).
router.include_router(command_router)
router.include_router(devices_ts_router)
router.include_router(faults_router, prefix="/faults")


@router.get("/", dependencies=[Depends(require_permission(Permission.DEVICES_READ))])
def list_devices(
    dm: DevicesManagerInterface = Depends(get_device_manager),
    types: list[str] | None = Query(None, alias="type"),
    ids: list[str] | None = Query(None),
    tags: list[str] | None = Query(None),
    is_faulty: bool | None = Query(None),
    asset_id: str | None = Query(None),
) -> list[Device]:
    parsed_tags = _parse_tags(tags)
    kwargs = to_list_devices_kwargs(
        {
            "ids": ids,
            "types": types,
            "tags": parsed_tags,
            "is_faulty": is_faulty,
            "asset_id": asset_id,
        }
    )
    return dm.list_devices(**kwargs)


@router.get(
    "/standard-types",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
def get_standard_types(
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
) -> list[StandardAttributeSchema]:
    return dm.list_standard_schemas()


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
