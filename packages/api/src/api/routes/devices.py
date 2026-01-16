import logging
from typing import Annotated

from core.device import ConfirmationError, Device, DeviceBase
from core.devices_manager import DevicesManager
from core.types import AttributeValueType
from dto.device_dto import DeviceCreateDTO, DeviceDTO, core_to_dto
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from storage import CoreFileStorage

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


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_device(
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
        driver = dm.drivers[dto.driver_id]
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Driver {dto.driver_id} not found")
    for field in driver.device_config_required:
        if field.required and field.name not in dto.config:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Field {field.name} is required in device config",
            )
    device_id = gen_id()
    base = DeviceBase(id=device_id, name=dto.name, config=dto.config)
    device = Device.from_base(base, driver=driver, transport=transport)
    dm.add_device(device)
    dto = core_to_dto(device)
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


@router.post("/{device_id}/attributes/{attribute_name}")
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


@router.patch("/{device_id}")
async def update_device(
    device_id: str,
    payload: UpdateAttributeBody,
    dm: DevicesManager = Depends(get_device_manager),
) -> DeviceDTO:
    device = _get_device(dm, device_id)
    try:
        await device.write_attribute_value(payload.attribute, payload.value)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return core_to_dto(device)
