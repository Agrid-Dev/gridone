from core.devices_manager import DevicesManager
from fastapi import APIRouter, Depends, HTTPException, Request

from api.schemas.device import Device


def get_device_manager(request: Request) -> DevicesManager:
    return request.app.state.device_manager


router = APIRouter()


@router.get("/")
@router.get("")
async def list_devices(
    dm: DevicesManager = Depends(get_device_manager),
) -> list[Device]:
    return list(dm.devices.values())


@router.get("/{device_id}")
async def get_device(device_id: str) -> Device:
    if device_id not in devices_db:
        raise HTTPException(status_code=404, detail="Device not found")
    return devices_db[device_id]
