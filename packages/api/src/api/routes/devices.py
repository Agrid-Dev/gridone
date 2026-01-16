import logging

from core.device import ConfirmationError, Device
from core.devices_manager import DevicesManager
from core.types import AttributeValueType
from dto.device_dto import DeviceDTO, core_to_dto
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.dependencies import get_device_manager
from api.schemas.device import AttributeUpdate

logger = logging.getLogger(__name__)


router = APIRouter()


class UpdateAttributeBody(BaseModel):
    attribute: str
    value: AttributeValueType | None


@router.get("/")
async def list_devices(
    dm: DevicesManager = Depends(get_device_manager),
) -> list[DeviceDTO]:
    return [core_to_dto(d) for d in dm.devices.values()]


def _get_device(dm: DevicesManager, device_id: str) -> Device:
    if device_id not in dm.devices:
        raise HTTPException(status_code=404, detail="Device not found")
    return dm.devices[device_id]


@router.get("/{device_id}")
async def get_device(
    device_id: str,
    dm: DevicesManager = Depends(get_device_manager),
) -> DeviceDTO:
    return core_to_dto(_get_device(dm, device_id))


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
            detail=f"No attribute '{attribute_name}' found for device {device_id}",
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
