import logging

from core.device import ConfirmationError
from core.devices_manager import DevicesManager
from fastapi import APIRouter, Depends, HTTPException, Request

from api.schemas.device import AttributeUpdate, DeviceBase

logger = logging.getLogger(__name__)


def get_device_manager(request: Request) -> DevicesManager:
    return request.app.state.device_manager


router = APIRouter()


@router.get("/")
async def list_devices(
    dm: DevicesManager = Depends(get_device_manager),
) -> list[DeviceBase]:
    return [DeviceBase.from_core(d) for d in dm.devices.values()]


@router.get("/{device_id}")
async def get_device(
    device_id: str,
    dm: DevicesManager = Depends(get_device_manager),
) -> DeviceBase:
    if device_id not in dm.devices:
        raise HTTPException(status_code=404, detail="Device not found")
    return DeviceBase.from_core(dm.devices[device_id])


CONFIRM_DELAY = 0.25


@router.post("/{device_id}/attributes/{attribute_name}")
async def update_attribute(
    device_id: str,
    attribute_name: str,
    update: AttributeUpdate,
    confirm: bool = True,
    dm: DevicesManager = Depends(get_device_manager),
) -> AttributeUpdate | None:
    try:
        logger.info("Setting  %s / %s to %s", device_id, attribute_name, update.value)
        await dm.devices[device_id].write_attribute_value(
            attribute_name, update.value, confirm=confirm
        )
        logger.info("Written")

    except KeyError as e:
        raise HTTPException(
            status_code=404, detail=f"Device or attribute not found: {str(e)}"
        )
    except (TypeError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ConfirmationError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return
