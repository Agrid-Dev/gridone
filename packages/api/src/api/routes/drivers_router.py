from typing import Annotated

from devices_manager import DevicesManager
from devices_manager.dto import DriverDTO
from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencies import get_device_manager

router = APIRouter()


@router.get("/")
def list_drivers(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> list[DriverDTO]:
    return dm.list_drivers()


@router.get("/{driver_id}")
def get_driver(
    driver_id: str,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DriverDTO:
    return dm.get_driver(driver_id)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_driver(
    payload: DriverDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DriverDTO:
    try:
        created_driver = await dm.add_driver_async(payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return created_driver


@router.delete("/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_driver(
    driver_id: str,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> None:
    await dm.delete_driver_async(driver_id)
