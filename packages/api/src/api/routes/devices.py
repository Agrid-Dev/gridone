from core.devices_manager import DevicesManager
from fastapi import APIRouter, Depends, HTTPException, Request

from api.schemas.device import DeviceBase


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
