import logging
from typing import Annotated

from devices_manager import DevicesManager
from devices_manager.core.device import ConfirmationError, Device
from devices_manager.dto.device_dto import (
    DeviceCreateDTO,
    DeviceDTO,
    DeviceUpdateDTO,
    core_to_dto,
)
from devices_manager.errors import InvalidError, NotFoundError
from devices_manager.storage import CoreFileStorage
from devices_manager.types import AttributeValueType
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from api.dependencies import get_device_manager, get_repository
from api.schemas.device import AttributeUpdate

logger = logging.getLogger(__name__)


router = APIRouter()


class UpdateAttributeBody(BaseModel):
    attribute: str
    value: AttributeValueType | None


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
    repository: Annotated[CoreFileStorage, Depends(get_repository)],
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
    repository.devices.write(device.id, device)
    return device


@router.patch("/{device_id}")
async def update_device(
    device_id: str,
    payload: DeviceUpdateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    repository: Annotated[CoreFileStorage, Depends(get_repository)],
) -> DeviceDTO:
    device = dm.devices[device_id]
    transport = device.transport
    if payload.transport_id is not None:
        try:
            transport = dm._transports[payload.transport_id]
        except KeyError:
            raise HTTPException(status_code=404, detail="Transport not found")
    driver = device.driver
    if payload.driver_id is not None:
        try:
            driver = dm._drivers[payload.driver_id]
        except KeyError:
            raise HTTPException(status_code=404, detail="Driver not found")
    if transport.protocol != driver.transport:
        raise HTTPException(
            status_code=422, detail="Transport and driver protocols do not match"
        )
    if payload.config is not None:
        try:
            dm._validate_device_config(payload.config, driver)
        except InvalidError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
            )
    updated_device = Device(
        id=device.id,
        name=payload.name if payload.name is not None else device.name,
        config=payload.config if payload.config is not None else device.config,
        driver=driver,
        transport=transport,
        attributes=device.attributes,
    )
    dm.devices[device_id] = updated_device
    dto = core_to_dto(updated_device)
    repository.devices.write(device_id, dto)
    return dto


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: str,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    repository: Annotated[CoreFileStorage, Depends(get_repository)],
):
    try:
        await dm.delete_device(device_id)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    repository.devices.delete(device_id)
    return


@router.post("/{device_id}/{attribute_name}")
async def update_attribute(
    device_id: str,
    attribute_name: str,
    update: AttributeUpdate,
    confirm: bool = True,
    dm: DevicesManager = Depends(get_device_manager),
) -> AttributeUpdate | None:
    device = _get_device(dm, device_id)
    if attribute_name not in device.attributes:
        raise HTTPException(
            status_code=404,
            detail=f"No attribute '{attribute_name}' found",
        )
    logger.info("Setting  %s / %s to %s", device_id, attribute_name, update.value)
    try:
        await dm.devices[device_id].write_attribute_value(
            attribute_name, update.value, confirm=confirm
        )
    except (TypeError, PermissionError) as e:
        logger.exception(e)
        raise HTTPException(status_code=400, detail=str(e))
    except ConfirmationError as e:
        logger.exception(e)
        raise HTTPException(status_code=409, detail=str(e))
    logger.info("Written")
    return
