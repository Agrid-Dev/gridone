from core.devices_manager import DevicesManager
from core.transports import TransportDTO
from fastapi import APIRouter, Depends

from api.get_device_manager import get_device_manager

router = APIRouter()


@router.get("/")
async def list_transports(
    dm: DevicesManager = Depends(get_device_manager),
) -> list[TransportDTO]:
    return [
        TransportDTO.model_validate(
            {"id": id, "protocol": tc.protocol, "config": tc.config}
        )
        for id, tc in dm.transports.items()
    ]
