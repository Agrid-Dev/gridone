import logging
from typing import Annotated

from devices_manager import DevicesManager
from devices_manager.core.device import ConfirmationError, Device, DeviceBase
from devices_manager.core.driver import DeviceConfigField
from devices_manager.dto.device_dto import (
    DeviceCreateDTO,
    DeviceDTO,
    DeviceUpdateDTO,
    core_to_dto,
)
from devices_manager.storage import CoreFileStorage
from devices_manager.types import AttributeValueType
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from api.dependencies import get_device_manager, get_repository
from api.schemas.device import AttributeUpdate

from .utils.gen_id import gen_id

logger = logging.getLogger(__name__)


router = APIRouter()


class UpdateAttributeBody(BaseModel):
    attribute: str
    value: AttributeValueType | None


@router.get("/")
def list_devices(
    dm: DevicesManager = Depends(get_device_manager),
) -> list[DeviceDTO]:
    return [core_to_dto(d) for d in dm.devices.values()]


def _get_device(dm: DevicesManager, device_id: str) -> Device:
    if device_id not in dm.devices:
        raise HTTPException(status_code=404, detail="Device not found")
    return dm.devices[device_id]


@router.get("/{device_id}")
def get_device(
    device_id: str,
    dm: DevicesManager = Depends(get_device_manager),
) -> DeviceDTO:
    return core_to_dto(_get_device(dm, device_id))


def _validate_device_config(
    device_config: dict, driver_fields: list[DeviceConfigField]
) -> None:
    for field in driver_fields:
        if field.required and field.name not in device_config:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Field {field.name} is required in device config",
            )


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_device(
    dto: DeviceCreateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    repository: Annotated[CoreFileStorage, Depends(get_repository)],
) -> DeviceDTO:
    try:
        transport = dm.transports[dto.transport_id]
    except KeyError:
        raise HTTPException(
            status_code=404, detail=f"Transport {dto.transport_id} not found"
        )
    try:
        driver = dm._drivers[dto.driver_id]
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Driver {dto.driver_id} not found")
    _validate_device_config(dto.config, driver.device_config_required)
    device_id = gen_id()
    base = DeviceBase(id=device_id, name=dto.name, config=dto.config)
    device = Device.from_base(base, driver=driver, transport=transport)
    dm.add_device(device)
    dto = core_to_dto(device)
    repository.devices.write(device_id, dto)
    return dto


@router.patch("/{device_id}")
async def update_device(
    device_id: str,
    payload: DeviceUpdateDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    repository: Annotated[CoreFileStorage, Depends(get_repository)],
) -> DeviceDTO:
    device = _get_device(dm, device_id)
    transport = device.transport
    if payload.transport_id is not None:
        try:
            transport = dm.transports[payload.transport_id]
        except KeyError:
            raise HTTPException(status_code=404, detail="Transport not found")
    driver = device.driver
    if payload.driver_id is not None:
        try:
            driver = dm._drivers[payload.driver_id]
        except KeyError:
            raise HTTPException(status_code=404, detail="Transport not found")
    if transport.protocol != driver.transport:
        raise HTTPException(
            status_code=422, detail="Transport and driver protocols do not match"
        )
    if payload.config is not None:
        _validate_device_config(payload.config, driver.device_config_required)
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
def delete_device(
    device_id: str,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    repository: Annotated[CoreFileStorage, Depends(get_repository)],
):
    _get_device(dm, device_id)
    del dm.devices[device_id]
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
