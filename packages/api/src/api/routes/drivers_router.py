from typing import Annotated

from devices_manager import DevicesManager
from devices_manager.dto import DriverDTO, DriverYamlDTO
from devices_manager.errors import NotFoundError
from devices_manager.storage import CoreFileStorage
from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencies import get_device_manager, get_repository

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
    try:
        return dm.get_driver(driver_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_driver(
    payload: DriverDTO | DriverYamlDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    repository: Annotated[CoreFileStorage, Depends(get_repository)],
) -> DriverDTO:
    driver_dto = (
        payload if isinstance(payload, DriverDTO) else DriverDTO.from_yaml(payload.yaml)
    )
    try:
        created_driver = dm.add_driver(driver_dto)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    repository.drivers.write(created_driver.id, created_driver)
    return created_driver


@router.delete("/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver(
    driver_id: str,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    repository: Annotated[CoreFileStorage, Depends(get_repository)],
) -> None:
    get_driver(driver_id, dm)  # check it exists
    for device in dm.devices.values():
        if device.driver.metadata.id == driver_id:
            raise HTTPException(
                status_code=409,
                detail=f"Driver {driver_id} is used by device {device.id}",
            )
    del dm.drivers[driver_id]
    repository.drivers.delete(driver_id)
