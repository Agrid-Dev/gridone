from typing import Annotated

from core.devices_manager import DevicesManager
from dto.driver_dto import DriverDTO, core_to_dto, dto_to_core
from fastapi import APIRouter, Depends, HTTPException
from storage import CoreFileStorage

from api.dependencies import get_device_manager, get_repository

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


@router.post("/", status_code=201)
def create_driver(
    driver_dto: DriverDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    repository: Annotated[CoreFileStorage, Depends(get_repository)],
) -> DriverDTO:
    if driver_dto.id in dm.drivers:
        raise HTTPException(
            status_code=409, detail=f"Driver {driver_dto.id} already exists"
        )
    driver = dto_to_core(driver_dto)
    dm.drivers[driver_dto.id] = driver
    repository.drivers.write(driver_dto.id, driver_dto)
    return driver_dto
