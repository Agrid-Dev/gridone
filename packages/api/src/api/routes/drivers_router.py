import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.dependencies import get_device_manager, get_ts_service, require_permission
from api.permissions import Permission
from devices_manager import DevicesServiceInterface
from devices_manager.dto import (
    AttributeDriverSpec,
    AttributePatch,
    AttributeRename,
    DriverPatch,
    DriverSpec,
    DriverYaml,
)
from models.errors import InvalidError
from timeseries.service import TimeSeriesService

logger = logging.getLogger(__name__)

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


@router.put(
    "/{driver_id}",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.DRIVERS_WRITE))],
)
async def create_driver(
    driver_id: str,
    payload: DriverSpec | DriverYaml,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> DriverSpec:
    driver_dto = (
        payload
        if isinstance(payload, DriverSpec)
        else DriverSpec.from_yaml(payload.yaml)
    )
    try:
        created_driver = await dm.add_driver(driver_id, driver_dto)
    except InvalidError:
        # InvalidError subclasses ValueError; avoid the 409 mapping below.
        raise
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


@router.put(
    "/{driver_id}/attributes/{attribute_id}",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.DRIVERS_WRITE))],
)
async def create_driver_attribute(
    driver_id: str,
    attribute_id: str,
    payload: AttributeDriverSpec,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> AttributeDriverSpec:
    if payload.name != attribute_id:
        msg = f"Attribute name {payload.name!r} must match URL id {attribute_id!r}"
        raise InvalidError(msg)
    return await dm.create_driver_attribute(driver_id, payload)


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


@router.delete(
    "/{driver_id}/attributes/{attribute_id}",
    dependencies=[Depends(require_permission(Permission.DRIVERS_WRITE))],
)
async def delete_driver_attribute(
    driver_id: str,
    attribute_id: str,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> DriverSpec:
    return await dm.delete_driver_attribute(driver_id, attribute_id)


@router.post(
    "/{driver_id}/attributes/{attribute_id}/rename",
    dependencies=[Depends(require_permission(Permission.DRIVERS_WRITE))],
)
async def rename_driver_attribute(
    driver_id: str,
    attribute_id: str,
    payload: AttributeRename,
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
    ts: Annotated[TimeSeriesService, Depends(get_ts_service)],
) -> AttributeDriverSpec:
    result = await dm.rename_driver_attribute(driver_id, attribute_id, payload.new_name)
    device_ids = [d.id for d in dm.list_devices(driver_id=driver_id)]
    try:
        await ts.rename_metric_for_owners(device_ids, attribute_id, payload.new_name)
    except Exception:
        logger.exception(
            "Driver attribute %s renamed to %s on driver %s, but the timeseries "
            "rename failed; rolling back the driver attribute rename",
            attribute_id,
            payload.new_name,
            driver_id,
        )
        try:
            await dm.rename_driver_attribute(driver_id, payload.new_name, attribute_id)
        except Exception:
            logger.exception(
                "Failed to roll back driver attribute rename for driver %s; "
                "attribute is now named %s instead of %s",
                driver_id,
                payload.new_name,
                attribute_id,
            )
        raise
    return result
