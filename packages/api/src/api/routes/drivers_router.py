from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.dependencies import get_device_manager, require_permission
from api.permissions import Permission
from devices_manager import DevicesServiceInterface
from devices_manager.dto import (
    AttributeDriverSpec,
    AttributePatch,
    DriverPatch,
    DriverSpec,
    DriverYaml,
)

router = APIRouter()


@router.get("/", dependencies=[Depends(require_permission(Permission.DRIVERS_READ))])
def list_drivers(
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
    device_type: str | None = Query(None, alias="type"),
) -> list[DriverSpec]:
    return dm.list_drivers(device_type=device_type)


@router.get(
    "/{driver_id}", dependencies=[Depends(require_permission(Permission.DRIVERS_READ))]
)
def get_driver(
    driver_id: str,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> DriverSpec:
    return dm.get_driver(driver_id)


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.DRIVERS_WRITE))],
)
async def create_driver(
    payload: DriverSpec | DriverYaml,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> DriverSpec:
    driver_dto = (
        payload
        if isinstance(payload, DriverSpec)
        else DriverSpec.from_yaml(payload.yaml)
    )
    try:
        created_driver = await dm.add_driver(driver_dto)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    return created_driver


@router.patch(
    "/{driver_id}",
    dependencies=[Depends(require_permission(Permission.DRIVERS_WRITE))],
)
async def patch_driver(
    driver_id: str,
    payload: DriverPatch,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> DriverSpec:
    return await dm.patch_driver(driver_id, payload)


@router.patch(
    "/{driver_id}/attributes/{attribute_id}",
    dependencies=[Depends(require_permission(Permission.DRIVERS_WRITE))],
)
async def patch_driver_attribute(
    driver_id: str,
    attribute_id: str,
    payload: AttributePatch,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> AttributeDriverSpec:
    return await dm.patch_driver_attribute(driver_id, attribute_id, payload)


@router.delete(
    "/{driver_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DRIVERS_WRITE))],
)
async def delete_driver(
    driver_id: str,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> None:
    await dm.delete_driver(driver_id)
