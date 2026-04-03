import logging
from datetime import UTC, datetime
from typing import Annotated

from devices_manager import DevicesManager
from devices_manager.dto import StandardAttributeSchemaDTO
from devices_manager.dto.device_dto import (
    DeviceCreateDTO,
    DeviceDTO,
    DeviceUpdateDTO,
)
from devices_manager.types import AttributeValueType, DataType, DeviceKind
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from models.errors import InvalidError, NotFoundError
from models.pagination import PaginationParams
from timeseries.domain import (
    CommandStatus,
    DataPoint,
    DeviceCommand,
    DeviceCommandCreate,
    SeriesKey,
)
from timeseries.service import TimeSeriesService

from api.dependencies import (
    get_current_user_id,
    get_device_manager,
    get_pagination_params,
    get_ts_service,
    require_permission,
)
from api.permissions import Permission
from api.schemas.device import (
    AttributeUpdate,
    CommandsQuery,
    SingleAttrTimeseriesPushPoint,
    StateUpdate,
    TimeseriesBulkPushRequest,
    TimeseriesSingleAttrPushRequest,
    get_commands_query,
)
from api.schemas.pagination import PaginatedResponse, to_paginated_response
from api.websocket.manager import WebSocketManager
from api.websocket.schemas import DeviceFullUpdateMessage

logger = logging.getLogger(__name__)


router = APIRouter()


async def _record_write(
    ts: TimeSeriesService,
    *,
    device_id: str,
    attribute_name: str,
    value: AttributeValueType,
    data_type: DataType,
    user_id: str,
    timestamp: datetime,
    command_status: CommandStatus = CommandStatus.SUCCESS,
    status_details: str | None = None,
) -> DeviceCommand:
    """Log a DeviceCommand and upsert its linked timeseries point.

    The command_id written into the DataPoint links the timeseries record back
    to the command log, enabling audit queries by command.
    """
    command = await ts.log_command(
        DeviceCommandCreate(
            device_id=device_id,
            attribute=attribute_name,
            user_id=user_id,
            value=value,
            data_type=data_type,
            timestamp=timestamp,
            status=command_status,
            status_details=status_details,
        )
    )
    await ts.upsert_points(
        SeriesKey(owner_id=device_id, metric=attribute_name),
        [DataPoint(timestamp=timestamp, value=value, command_id=command.id)],
        create_if_not_found=True,
    )
    return command


@router.get("/", dependencies=[Depends(require_permission(Permission.DEVICES_READ))])
def list_devices(
    dm: DevicesManager = Depends(get_device_manager),
    device_type: str | None = Query(None, alias="type"),
) -> list[DeviceDTO]:
    return dm.list_devices(device_type=device_type)


@router.get(
    "/standard-types",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
def get_standard_types(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> list[StandardAttributeSchemaDTO]:
    return dm.list_standard_schemas()


@router.get(
    "/commands", dependencies=[Depends(require_permission(Permission.DEVICES_READ))]
)
async def get_commands(
    request: Request,
    query: CommandsQuery = Depends(get_commands_query),
    pagination: PaginationParams = Depends(get_pagination_params),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> PaginatedResponse[DeviceCommand]:
    page = await ts.get_commands(
        ids=query.ids,
        device_id=query.device_id,
        attribute=query.attribute,
        user_id=query.user_id,
        start=query.start,
        end=query.end,
        last=query.last,
        sort=query.sort,
        pagination=pagination,
    )
    return to_paginated_response(page, str(request.url))


@router.get(
    "/{device_id}", dependencies=[Depends(require_permission(Permission.DEVICES_READ))]
)
def get_device(
    device_id: str,
    dm: DevicesManager = Depends(get_device_manager),
) -> DeviceDTO:
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
    ts: TimeSeriesService = Depends(get_ts_service),
) -> PaginatedResponse[DeviceCommand]:
    page = await ts.get_commands(
        ids=query.ids,
        device_id=device_id,
        attribute=query.attribute,
        user_id=query.user_id,
        start=query.start,
        end=query.end,
        last=query.last,
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
    dto: DeviceCreateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DeviceDTO:
    return await dm.add_device(dto)


@router.patch(
    "/{device_id}", dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))]
)
async def update_device(
    device_id: str,
    payload: DeviceUpdateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DeviceDTO:
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
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
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
    dm: DevicesManager = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> None:
    device_dto = dm.get_device(device_id)
    if device_dto.kind != DeviceKind.VIRTUAL:
        raise HTTPException(status_code=405, detail="Only supported on virtual devices")
    try:
        dm.validate_timeseries_push(
            device_id, [(p.attribute, p.value) for p in body.data]
        )
    except InvalidError as e:
        raise HTTPException(status_code=400, detail=str(e))
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
    dm: DevicesManager = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> None:
    device_dto = dm.get_device(device_id)
    if device_dto.kind != DeviceKind.VIRTUAL:
        raise HTTPException(status_code=405, detail="Only supported on virtual devices")
    if device_dto.attributes.get(attr_name) is None:
        raise HTTPException(
            status_code=404, detail=f"Attribute '{attr_name}' not found"
        )
    try:
        dm.validate_timeseries_push(
            device_id, [(attr_name, p.value) for p in body.data]
        )
    except InvalidError as e:
        raise HTTPException(status_code=400, detail=str(e))
    points = _to_data_points(body.data)
    await ts.upsert_points(
        SeriesKey(owner_id=device_id, metric=attr_name),
        points,
        create_if_not_found=True,
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
    dm: DevicesManager = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
    user_id: str = Depends(get_current_user_id),
) -> AttributeUpdate:
    device_dto = dm.get_device(device_id)
    attr = device_dto.attributes.get(attribute_name)
    if attr is None:
        raise HTTPException(
            status_code=404, detail=f"Attribute '{attribute_name}' not found"
        )
    data_type = attr.data_type
    timestamp = datetime.now(UTC)

    try:
        attribute = await dm.write_device_attribute(
            device_id, attribute_name, update.value, confirm=confirm
        )
        await _record_write(
            ts,
            device_id=device_id,
            attribute_name=attribute_name,
            value=update.value,
            data_type=data_type,
            user_id=user_id,
            timestamp=attribute.last_changed or timestamp,
        )
    except (TypeError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        if not isinstance(e, (NotFoundError, InvalidError)):
            await ts.log_command(
                DeviceCommandCreate(
                    device_id=device_id,
                    attribute=attribute_name,
                    user_id=user_id,
                    value=update.value,
                    data_type=data_type,
                    timestamp=timestamp,
                    status=CommandStatus.ERROR,
                    status_details=str(e),
                )
            )
        raise
    return update


@router.put(
    "/{device_id}/state",
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def update_device_state(
    device_id: str,
    update: StateUpdate,
    request: Request,
    dm: DevicesManager = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
    user_id: str = Depends(get_current_user_id),
) -> dict[str, AttributeValueType]:
    device_dto = dm.get_device(device_id)
    if device_dto.kind != DeviceKind.VIRTUAL:
        raise HTTPException(status_code=405, detail="Only supported on virtual devices")
    timestamp = update.timestamp or datetime.now(UTC)
    try:
        updated = await dm.update_device_state(device_id, update.values)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (TypeError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    for attr_name, attr in updated.items():
        await _record_write(
            ts,
            device_id=device_id,
            attribute_name=attr_name,
            value=update.values[attr_name],
            data_type=attr.data_type,
            user_id=user_id,
            timestamp=timestamp,
        )
    ws: WebSocketManager = request.app.state.websocket_manager
    await ws.broadcast(DeviceFullUpdateMessage(device=device_dto))
    return update.values
