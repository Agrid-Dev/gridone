from fastapi import APIRouter, HTTPException

from api.schemas.device import Device

router = APIRouter()

# Mock database
devices_db: dict[str, Device] = {
    "my-device": Device(
        id="my-device", driver="xb12", config={"device_instance": 5456}
    ),
    "my-device2": Device(
        id="my-device2", driver="xb12", config={"device_instance": 88}
    ),
}


@router.get("/")
@router.get("")
async def list_devices() -> list[Device]:
    return list(devices_db.values())


@router.get("/{device_id}")
async def get_device(device_id: str) -> Device:
    if device_id not in devices_db:
        raise HTTPException(status_code=404, detail="Device not found")
    return devices_db[device_id]
