import logging
from datetime import UTC, datetime
from typing import Annotated

from devices_manager import DevicesManager
from devices_manager.dto.device_dto import (
    DeviceCreateDTO,
    DeviceDTO,
    DeviceUpdateDTO,
)
from fastapi import APIRouter, Depends, HTTPException, Request, status
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
)
from api.schemas.device import AttributeUpdate, CommandsQuery, get_commands_query
from api.schemas.pagination import PaginatedResponse, to_paginated_response

logger = logging.getLogger(__name__)


router = APIRouter()


@router.get("/")
def list_devices(
    dm: DevicesManager = Depends(get_device_manager),
) -> list[DeviceDTO]:
    return dm.list_devices()


@router.get("/commands")
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


@router.get("/{device_id}")
def get_device(
    device_id: str,
    dm: DevicesManager = Depends(get_device_manager),
) -> DeviceDTO:
    return dm.get_device(device_id)


@router.get("/{device_id}/commands")
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


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_device(
    dto: DeviceCreateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DeviceDTO:
    return await dm.add_device(dto)


@router.patch("/{device_id}")
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


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: str,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
):
    await dm.delete_device(device_id)
    return


@router.post("/{device_id}/{attribute_name}")
async def update_attribute(
    device_id: str,
    attribute_name: str,
    update: AttributeUpdate,
    confirm: bool = True,
    dm: DevicesManager = Depends(get_device_manager),
    ts: TimeSeriesService = Depends(get_ts_service),
    user_id: str = Depends(get_current_user_id),
) -> AttributeUpdate:
    data_type = dm.get_device(device_id).attributes[attribute_name].data_type

    def make_command(
        status: CommandStatus, status_details: str | None = None
    ) -> DeviceCommandCreate:
        return DeviceCommandCreate(
            device_id=device_id,
            attribute=attribute_name,
            user_id=user_id,
            value=update.value,
            data_type=data_type,
            timestamp=datetime.now(UTC),
            status=status,
            status_details=status_details,
        )

    try:
        attribute = await dm.write_device_attribute(
            device_id, attribute_name, update.value, confirm=confirm
        )
        command = await ts.log_command(make_command(CommandStatus.SUCCESS))
        await ts.upsert_points(
            SeriesKey(owner_id=device_id, metric=attribute_name),
            [
                DataPoint(
                    timestamp=attribute.last_changed or datetime.now(UTC),
                    value=update.value,
                    command_id=command.id,
                )
            ],
            create_if_not_found=True,
        )

    except (TypeError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        if not isinstance(e, (NotFoundError, InvalidError)):
            await ts.log_command(make_command(CommandStatus.ERROR, str(e)))
        raise e
    return update
