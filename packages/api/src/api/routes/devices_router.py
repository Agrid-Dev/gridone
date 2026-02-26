import logging
from typing import Annotated

from devices_manager import DevicesManager
from devices_manager.dto.device_dto import (
    DeviceCreateDTO,
    DeviceDTO,
    DeviceUpdateDTO,
)
from fastapi import APIRouter, Depends, HTTPException, status

from users import AuthorizationService, Permission
from api.dependencies import (
    get_authorization_service,
    get_current_user_id,
    get_device_manager,
    require_device_permission,
    require_permission,
)
from api.schemas.device import AttributeUpdate

logger = logging.getLogger(__name__)


router = APIRouter()


@router.get("/")
async def list_devices(
    user_id: Annotated[str, Depends(get_current_user_id)],
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    authz: Annotated[AuthorizationService, Depends(get_authorization_service)],
) -> list[DeviceDTO]:
    has_perm = await authz.check_permission(user_id, Permission.DEVICES_READ)
    if not has_perm:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing permission: devices:read",
        )
    all_devices = dm.list_devices()
    accessible_ids = await authz.filter_device_ids(
        user_id, Permission.DEVICES_READ, [d.id for d in all_devices]
    )
    accessible_set = set(accessible_ids)
    return [d for d in all_devices if d.id in accessible_set]


@router.get("/{device_id}")
async def get_device(
    device_id: str,
    _: Annotated[str, Depends(require_device_permission(Permission.DEVICES_READ))],
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DeviceDTO:
    return dm.get_device(device_id)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_device(
    dto: DeviceCreateDTO,
    _: Annotated[str, Depends(require_permission(Permission.DEVICES_MANAGE))],
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DeviceDTO:
    return await dm.add_device(dto)


@router.patch("/{device_id}")
async def update_device(
    device_id: str,
    payload: DeviceUpdateDTO,
    _: Annotated[str, Depends(require_device_permission(Permission.DEVICES_MANAGE))],
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> DeviceDTO:
    try:
        device = await dm.update_device(device_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: str,
    _: Annotated[str, Depends(require_device_permission(Permission.DEVICES_MANAGE))],
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
):
    await dm.delete_device(device_id)
    return


@router.post("/{device_id}/{attribute_name}")
async def update_attribute(
    device_id: str,
    attribute_name: str,
    update: AttributeUpdate,
    _: Annotated[str, Depends(require_device_permission(Permission.DEVICES_COMMAND))],
    confirm: bool = True,
    dm: DevicesManager = Depends(get_device_manager),
) -> AttributeUpdate | None:
    try:
        await dm.write_device_attribute(
            device_id, attribute_name, update.value, confirm=confirm
        )
    except (TypeError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return None
