from typing import Annotated

from core.devices_manager import DevicesManager
from dto.driver_dto import DriverDTO, core_to_dto
from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_device_manager

router = APIRouter()


@router.get("/")
def list_drivers(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> list[DriverDTO]:
    return [core_to_dto(tc) for tc in dm.drivers.values()]


@router.get("/{driver_id}")
def get_driver(
    driver_id: str,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DriverDTO:
    try:
        return core_to_dto(dm.drivers[driver_id])
    except KeyError as ke:
        raise HTTPException(
            status_code=404, detail=f"Driver {driver_id} not found"
        ) from ke
