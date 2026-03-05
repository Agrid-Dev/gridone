import logging
from datetime import UTC, datetime
from typing import Annotated

from devices_manager import DevicesManager
from devices_manager.dto.device_dto import (
    DeviceCreateDTO,
    DeviceDTO,
    DeviceUpdateDTO,
)
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from models.errors import InvalidError, NotFoundError
from models.pagination import PaginationParams
from timeseries.domain import CommandStatus, DeviceCommand, DeviceCommandCreate
from timeseries.service import TimeSeriesService

from api.dependencies import (
    get_current_user_id,
    get_device_manager,
    get_pagination_params,
    get_ts_service,
)
from api.schemas.device import AttributeUpdate
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
    device_id: str | None = Query(None),
    attribute: str | None = Query(None),
    user_id: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    last: str | None = Query(None),
    pagination: PaginationParams = Depends(get_pagination_params),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> PaginatedResponse[DeviceCommand]:
    page = await ts.get_commands(
        device_id=device_id,
        attribute=attribute,
        user_id=user_id,
        start=start,
        end=end,
        last=last,
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
    attribute: str | None = Query(None),
    user_id: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    last: str | None = Query(None),
    pagination: PaginationParams = Depends(get_pagination_params),
    ts: TimeSeriesService = Depends(get_ts_service),
) -> PaginatedResponse[DeviceCommand]:
    page = await ts.get_commands(
        device_id=device_id,
        attribute=attribute,
        user_id=user_id,
        start=start,
        end=end,
        last=last,
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
    async def log_command(status: CommandStatus, status_text: str | None = None):
        command = DeviceCommandCreate(
            device_id=device_id,
            attribute=attribute_name,
            user_id=user_id,
            value=update.value,
            data_type=dm.get_device(device_id).attributes[attribute_name].data_type,
            timestamp=datetime.now(UTC),
            status=status,
            status_details=status_text,
        )
        await ts.log_command(command)

    try:
        await dm.write_device_attribute(
            device_id, attribute_name, update.value, confirm=confirm
        )
        await log_command(CommandStatus.SUCCESS, None)

    except (TypeError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        if not isinstance(e, (NotFoundError, InvalidError)):
            await log_command(CommandStatus.ERROR, str(e))
        raise e
    return update
