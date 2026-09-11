"""Shared device groups, mounted before the device-ID routes."""

from fastapi import APIRouter, Depends, Query, Request, Response, status

from api.auth import get_current_user_id, require_permission
from api.dependencies import get_device_manager
from api.group_commands import (
    GroupCommandConfirm,
    GroupCommandPrepare,
    GroupCommandPreview,
    GroupCommands,
)
from api.group_references import GroupReferences
from api.permissions import Permission
from api.schemas.command import BatchDispatchResponse
from devices_manager import DevicesServiceInterface
from devices_manager.core.device_group import (
    DeviceGroup,
    DeviceGroupCreate,
    DeviceGroupUpdate,
)
from devices_manager.dto.presentation_dto import PresentationResponse
from models.resource_conflict import RelatedResource

router = APIRouter()


def get_group_commands(request: Request) -> GroupCommands:
    return request.app.state.group_commands


def get_group_references(request: Request) -> GroupReferences:
    return request.app.state.group_references


@router.get("", dependencies=[Depends(require_permission(Permission.DEVICES_READ))])
async def list_device_groups(
    dm: DevicesServiceInterface = Depends(get_device_manager),
) -> list[DeviceGroup]:
    return dm.list_groups()


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def create_device_group(
    body: DeviceGroupCreate, dm: DevicesServiceInterface = Depends(get_device_manager)
) -> DeviceGroup:
    return await dm.create_group(body)


@router.get(
    "/{group_id}", dependencies=[Depends(require_permission(Permission.DEVICES_READ))]
)
async def get_device_group(
    group_id: str, dm: DevicesServiceInterface = Depends(get_device_manager)
) -> DeviceGroup:
    return dm.get_group(group_id)


@router.patch(
    "/{group_id}", dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))]
)
async def update_device_group(
    group_id: str,
    body: DeviceGroupUpdate,
    dm: DevicesServiceInterface = Depends(get_device_manager),
) -> DeviceGroup:
    return await dm.update_group(group_id, body)


@router.delete(
    "/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def delete_device_group(
    group_id: str, dm: DevicesServiceInterface = Depends(get_device_manager)
) -> None:
    await dm.delete_group(group_id)


@router.get(
    "/{group_id}/references",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
async def list_device_group_references(
    group_id: str,
    dm: DevicesServiceInterface = Depends(get_device_manager),
    references: GroupReferences = Depends(get_group_references),
) -> list[RelatedResource]:
    dm.get_group(group_id)
    return await references.list(group_id)


@router.get(
    "/{group_id}/presentation",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
)
async def get_group_presentation(
    group_id: str, dm: DevicesServiceInterface = Depends(get_device_manager)
) -> PresentationResponse | None:
    return await dm.get_driver_presentation_response(dm.get_group(group_id).driver_id)


@router.post(
    "/{group_id}/commands/preview",
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def preview_group_command(
    group_id: str,
    body: GroupCommandPrepare,
    commands: GroupCommands = Depends(get_group_commands),
    user_id: str = Depends(get_current_user_id),
) -> GroupCommandPreview:
    return commands.prepare(group_id, body, user_id)


@router.post(
    "/{group_id}/commands",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def confirm_group_command(
    group_id: str,
    body: GroupCommandConfirm,
    commands: GroupCommands = Depends(get_group_commands),
    user_id: str = Depends(get_current_user_id),
) -> BatchDispatchResponse:
    return await commands.confirm(group_id, body, user_id)


@router.get(
    "/{group_id}/presentation/assets/{asset_id}",
    dependencies=[Depends(require_permission(Permission.DEVICES_READ))],
    response_class=Response,
)
async def get_group_presentation_asset(
    group_id: str,
    asset_id: str,
    revision: str = Query(min_length=1),
    dm: DevicesServiceInterface = Depends(get_device_manager),
) -> Response:
    resource = await dm.get_group_presentation_asset(group_id, revision, asset_id)
    return Response(
        content=resource.data,
        media_type=resource.media_type,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=31536000, immutable",
        },
    )
