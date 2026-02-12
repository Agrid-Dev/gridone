from typing import Annotated

from devices_manager import DevicesManager
from devices_manager.dto import DriverDTO, DriverYamlDTO
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
def create_driver(
    payload: DriverDTO | DriverYamlDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DriverDTO:
    driver_dto = (
        payload if isinstance(payload, DriverDTO) else DriverDTO.from_yaml(payload.yaml)
    )
    try:
        created_driver = dm.add_driver(driver_dto)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return created_driver


@router.delete("/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver(
    driver_id: str,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> None:
    dm.delete_driver(driver_id)
