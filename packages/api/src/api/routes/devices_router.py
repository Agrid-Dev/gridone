from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from api.dependencies import (
    get_device_manager,
    get_ts_service,
    require_permission,
)
from api.devices_filter import parse_tags_params, to_list_devices_kwargs
from api.permissions import Permission
from api.routes.command_router import router as command_router
from api.routes.devices_timeseries_router import router as devices_ts_router
from api.routes.faults_router import router as faults_router
from api.schemas.device import (
    AttributeCoverageResponse,
    DeviceBatchCreate,
    DeviceBatchItemResult,
    SingleAttrTimeseriesPushPoint,
    TagValueBody,
    TimeseriesBulkPushRequest,
    TimeseriesSingleAttrPushRequest,
)
from api.targets import compute_attribute_coverage
from devices_manager import DevicesServiceInterface
from devices_manager.core.device import Attribute
from devices_manager.core.device.event_log import AttributeLogs
from devices_manager.dto import StandardAttributeSchema
from devices_manager.dto.device_dto import (
    Device,
    DeviceCreate,
    DeviceUpdate,
)
from models.errors import ConflictError, InvalidError, NotFoundError
from timeseries.domain import (
    DataPoint,
    SeriesKey,
)
from timeseries.service import TimeSeriesService

logger = logging.getLogger(__name__)


router = APIRouter()
# Command dispatch + templates live in their own router but are mounted
# under /devices so URLs stay device-scoped (``/devices/commands``,
# ``/devices/{id}/commands``, ``/devices/commands/templates/...``).
router.include_router(command_router)
router.include_router(devices_ts_router)
router.include_router(faults_router, prefix="/faults")


def get_devices_query(
    types: list[str] | None = Query(None, alias="type"),
    ids: list[str] | None = Query(None),
    tags: list[str] | None = Query(None),
    *,
    attribute: str | None = Query(None),
    is_faulty: bool | None = Query(None),
    asset_id: str | None = Query(None),
    search: str | None = Query(None),
    driver_id: str | None = Query(None),
    transport_id: str | None = Query(None),
) -> dict[str, Any]:
    """Parse the device-list query params into ``DM.list_devices`` kwargs.

    Shared by every endpoint that selects a device set (``GET /devices``,
    ``GET /devices/attributes``) so the filters stay identical.
    """
    return to_list_devices_kwargs(
        {
            "ids": ids,
            "types": types,
            "tags": parse_tags_params(tags),
            "attribute": attribute,
            "is_faulty": is_faulty,
            "asset_id": asset_id,
            "search": search,
            "driver_id": driver_id,
            "transport_id": transport_id,
        }
    )


@router.get("/", dependencies=[Depends(require_permission(Permission.DEVICES_READ))])
def list_devices(
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
    query: Annotated[dict[str, Any], Depends(get_devices_query)],
) -> list[Device]:
    return dm.list_devices(**query)


@router.get(
    "/attributes",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
def list_device_attributes(
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
    query: Annotated[dict[str, Any], Depends(get_devices_query)],
) -> AttributeCoverageResponse:
    """Report attribute coverage over the matched device set.

    Backs target pickers: the same filters as ``GET /devices`` select the
    device set, and the response annotates every exposed attribute with its
    data types and coverage counts.
    """
    devices = dm.list_devices(**query)
    return AttributeCoverageResponse(
        total_devices=len(devices),
        attributes=compute_attribute_coverage(devices),
    )


@router.get(
    "/standard-types",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
def get_standard_types(
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> list[StandardAttributeSchema]:
    return dm.list_standard_schemas()


@router.get(
    "/{device_id}/{attr_name}/logs",
    dependencies=[Depends(require_permission(Permission.DEVICES_LOGS_READ))],
    response_model_exclude_none=True,
)
def get_attribute_logs(
    device_id: str,
    attr_name: str,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> AttributeLogs:
    return dm.get_attribute_logs(device_id, attr_name)


@router.post(
    "/{device_id}/attributes/{attr_name}/refresh",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
async def refresh_device_attribute(
    device_id: str,
    attr_name: str,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> Attribute:
    return await dm.refresh_device_attribute(device_id, attr_name)


@router.get(
    "/{device_id}", dependencies=[Depends(require_permission(Permission.DEVICES_READ))]
)
def get_device(
    device_id: str,
    dm: DevicesServiceInterface = Depends(get_device_manager),
) -> Device:
    return dm.get_device(device_id)


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def create_device(
    dto: DeviceCreate,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> Device:
    return await dm.add_device(dto)


@router.post(
    "/batch",
    status_code=status.HTTP_207_MULTI_STATUS,
    responses={
        status.HTTP_201_CREATED: {"description": "Every device was created"},
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "description": "Every device failed to be created"
        },
    },
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def create_devices_batch(
    dto: DeviceBatchCreate,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
    response: Response,
) -> list[DeviceBatchItemResult]:
    """Create every device in the batch independently (partial success).

    A thin loop over `add_device`: each entry is attempted independently and
    one entry's failure does not block the others. The status code reflects
    the outcome: 201 when every entry succeeded, 422 when every entry failed,
    207 for a mix of both.
    """
    results: list[DeviceBatchItemResult] = []
    for item in dto.devices:
        create = DeviceCreate(
            name=item.name,
            config=item.config,
            driver_id=dto.driver_id,
            transport_id=dto.transport_id,
        )
        try:
            device = await dm.add_device(create)
        except (InvalidError, NotFoundError, ConflictError) as e:
            results.append(DeviceBatchItemResult(error=str(e)))
        else:
            results.append(DeviceBatchItemResult(device=device))

    if all(r.error is None for r in results):
        response.status_code = status.HTTP_201_CREATED
    elif all(r.device is None for r in results):
        response.status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    else:
        response.status_code = status.HTTP_207_MULTI_STATUS
    return results


@router.patch(
    "/{device_id}", dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))]
)
async def update_device(
    device_id: str,
    payload: DeviceUpdate,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> Device:
    try:
        device = await dm.update_device(device_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return device


@router.delete(
    "/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def delete_device(
    device_id: str,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> None:
    await dm.delete_device(device_id)


@router.put(
    "/{device_id}/tags/{key}",
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def set_device_tag(
    device_id: str,
    key: str,
    body: TagValueBody,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
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
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> None:
    await dm.delete_device_tag(device_id, key)


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
    dm: DevicesServiceInterface = Depends(get_device_manager),
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
    dm: DevicesServiceInterface = Depends(get_device_manager),
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
