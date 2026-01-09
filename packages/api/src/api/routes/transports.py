from typing import Annotated

from core.devices_manager import DevicesManager
from dto.transport import TransportDTO, core_to_dto
from fastapi import APIRouter, Depends, HTTPException

from api.get_device_manager import get_device_manager

router = APIRouter()


@router.get("/")
def list_transports(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> list[TransportDTO]:
    return [core_to_dto(tc) for tc in dm.transports.values()]


@router.get("/{transport_id}")
def get_transport(
    transport_id: str, dm: Annotated[DevicesManager, Depends(get_device_manager)]
) -> TransportDTO:
    try:
        tc = dm.transports[transport_id]
        return core_to_dto(tc)
    except KeyError:
        raise HTTPException(status_code=404, detail="Transport not found")
