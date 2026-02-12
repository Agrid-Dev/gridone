import logging
from typing import Annotated

from devices_manager import DevicesManager
from devices_manager.dto.device_dto import (
    DeviceCreateDTO,
    DeviceDTO,
    DeviceUpdateDTO,
)
from devices_manager.errors import ConfirmationError, InvalidError, NotFoundError
from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencies import get_device_manager
from api.schemas.device import AttributeUpdate

logger = logging.getLogger(__name__)


router = APIRouter()


@router.get("/")
def list_devices(
    dm: DevicesManager = Depends(get_device_manager),
) -> list[DeviceDTO]:
    return dm.list_devices()


def _get_device(dm: DevicesManager, device_id: str) -> DeviceDTO:
    try:
        return dm.get_device(device_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Device not found")


@router.get("/{device_id}")
def get_device(
    device_id: str,
    dm: DevicesManager = Depends(get_device_manager),
) -> DeviceDTO:
    return _get_device(dm, device_id)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_device(
    dto: DeviceCreateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DeviceDTO:
    try:
        device = dm.add_device(dto)
    except NotFoundError:
        raise HTTPException(
            status_code=404, detail=f"Transport {dto.transport_id} not found"
        )
    except InvalidError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        )
    return device


@router.patch("/{device_id}")
async def update_device(
    device_id: str,
    payload: DeviceUpdateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DeviceDTO:
    try:
        device = await dm.update_device(device_id, payload)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: str,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
):
    try:
        await dm.delete_device(device_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return


@router.post("/{device_id}/{attribute_name}")
async def update_attribute(
    device_id: str,
    attribute_name: str,
    update: AttributeUpdate,
    confirm: bool = True,
    dm: DevicesManager = Depends(get_device_manager),
) -> AttributeUpdate | None:
    try:
        await dm.write_device_attribute(
            device_id, attribute_name, update.value, confirm=confirm
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (TypeError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ConfirmationError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return None
