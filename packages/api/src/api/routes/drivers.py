from typing import Annotated

from core.devices_manager import DevicesManager
from dto.driver_dto import DriverDTO, DriverYamlDTO, core_to_dto, dto_to_core
from fastapi import APIRouter, Depends, HTTPException, status
from storage import CoreFileStorage

from api.dependencies import get_device_manager, get_repository
from api.schemas.response_models import (
    RawLinks,
    ResourceResponse,
    build_resource_response,
)

router = APIRouter()


@router.get("/")
def list_drivers(
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> list[DriverDTO]:
    return [core_to_dto(tc) for tc in dm.drivers.values()]


def build_response(
    dm: DevicesManager,
    driver: DriverDTO,
) -> ResourceResponse[DriverDTO]:
    base_path = "/drivers"
    driver_id = driver.id
    links: RawLinks = {
        "update": {"method": "PUT", "href": f"{base_path}/{driver_id}"},
        "self": {"method": "GET", "href": f"{base_path}/{driver_id}"},
        "delete": {"method": "DELETE", "href": f"{base_path}/{driver_id}"},
    }
    if not dm.can_delete("driver", driver_id):
        del links["delete"]
    return build_resource_response(driver, links)


@router.get("/{driver_id}")
def get_driver(
    driver_id: str,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> ResourceResponse[DriverDTO]:
    try:
        dto = core_to_dto(dm.drivers[driver_id])

        return build_response(dm, dto)

    except KeyError as ke:
        raise HTTPException(
            status_code=404, detail=f"Driver {driver_id} not found"
        ) from ke


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_driver(
    payload: DriverDTO | DriverYamlDTO,
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    repository: Annotated[CoreFileStorage, Depends(get_repository)],
) -> ResourceResponse[DriverDTO]:
    driver_dto = (
        payload if isinstance(payload, DriverDTO) else DriverDTO.from_yaml(payload.yaml)
    )
    if driver_dto.id in dm.drivers:
        raise HTTPException(
            status_code=409, detail=f"Driver {driver_dto.id} already exists"
        )
    driver = dto_to_core(driver_dto)
    dm.drivers[driver_dto.id] = driver
    repository.drivers.write(driver_dto.id, driver_dto)
    return build_response(dm, driver_dto)


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
