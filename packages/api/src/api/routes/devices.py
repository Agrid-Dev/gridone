from core.devices_manager import DevicesManager
from core.types import AttributeValueType
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from api.schemas.device import DeviceBase


def get_device_manager(request: Request) -> DevicesManager:
    return request.app.state.device_manager


router = APIRouter()


class UpdateAttributeBody(BaseModel):
    attribute: str
    value: AttributeValueType | None


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


@router.patch("/{device_id}")
async def update_device(
    device_id: str,
    payload: UpdateAttributeBody,
    dm: DevicesManager = Depends(get_device_manager),
) -> DeviceBase:
    if device_id not in dm.devices:
        raise HTTPException(status_code=404, detail="Device not found")

    device = dm.devices[device_id]
    try:
        await device.write_attribute_value(payload.attribute, payload.value)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return DeviceBase.from_core(device)
