from typing import Annotated

from assets import (
    Asset,
    AssetCreate,
    AssetsManager,
    AssetUpdate,
    get_asset_create_schema,
)
from commands import CommandsServiceInterface
from devices_manager import DevicesManagerInterface
from fastapi import APIRouter, Depends, Query, status
from models.errors import NotFoundError
from pydantic import BaseModel

from api.dependencies import (
    get_assets_manager,
    get_commands_service,
    get_current_user_id,
    get_device_manager,
    require_permission,
)
from api.permissions import Permission
from api.routes._command_helpers import (
    resolve_attribute_data_type,
    to_batch_dispatch_response,
)
from api.schemas.command import AssetCommand, BatchDispatchResponse

router = APIRouter()


class DeviceLinkRequest(BaseModel):
    device_id: str


class ReorderRequest(BaseModel):
    ordered_ids: list[str]


@router.get(
    "/schema", dependencies=[Depends(require_permission(Permission.ASSETS_READ))]
)
async def get_schema() -> dict:
    """JSON schema of AssetCreate for frontend form validation."""
    return get_asset_create_schema()


@router.get("/tree", dependencies=[Depends(require_permission(Permission.ASSETS_READ))])
async def get_tree(
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> list[dict]:
    return await am.get_tree()


@router.get(
    "/tree-with-devices",
    dependencies=[Depends(require_permission(Permission.ASSETS_READ))],
)
async def get_tree_with_devices(
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
) -> list[dict]:
    tree = await am.get_tree()
    all_links = await am.get_all_device_links()
    name_map = {d.id: d.name for d in dm.list_devices()}

    def enrich(nodes: list[dict]) -> None:
        for node in nodes:
            device_ids = all_links.get(node["id"], [])
            node["devices"] = [
                {"id": did, "name": name_map.get(did, did)} for did in device_ids
            ]
            enrich(node["children"])

    enrich(tree)
    return tree


@router.get(
    "/",
    response_model=list[Asset],
    dependencies=[Depends(require_permission(Permission.ASSETS_READ))],
)
async def list_assets(
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
    parent_id: str | None = Query(None),
    type: str | None = Query(None),
) -> list[Asset]:
    return await am.list_all(parent_id=parent_id, asset_type=type)


@router.get(
    "/{asset_id}",
    response_model=Asset,
    dependencies=[Depends(require_permission(Permission.ASSETS_READ))],
)
async def get_asset(
    asset_id: str,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> Asset:
    return await am.get_by_id(asset_id)


@router.post(
    "/",
    response_model=Asset,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.ASSETS_WRITE))],
)
async def create_asset(
    body: AssetCreate,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> Asset:
    return await am.create_asset(body)


@router.put(
    "/{asset_id}",
    response_model=Asset,
    dependencies=[Depends(require_permission(Permission.ASSETS_WRITE))],
)
async def update_asset(
    asset_id: str,
    body: AssetUpdate,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> Asset:
    return await am.update_asset(asset_id, body)


@router.delete(
    "/{asset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.ASSETS_WRITE))],
)
async def delete_asset(
    asset_id: str,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> None:
    await am.delete_asset(asset_id)


@router.put(
    "/{asset_id}/children/order",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.ASSETS_WRITE))],
)
async def reorder_children(
    asset_id: str,
    body: ReorderRequest,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> None:
    await am.reorder_siblings(asset_id, body.ordered_ids)


# Device linking endpoints


@router.get(
    "/{asset_id}/devices",
    response_model=list[str],
    dependencies=[Depends(require_permission(Permission.ASSETS_READ))],
)
async def list_asset_devices(
    asset_id: str,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> list[str]:
    return await am.resolve_device_ids(asset_id)


@router.post(
    "/{asset_id}/devices",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.ASSETS_WRITE))],
)
async def link_device(
    asset_id: str,
    body: DeviceLinkRequest,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> None:
    await am.link_device(asset_id, body.device_id)


@router.delete(
    "/{asset_id}/devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.ASSETS_WRITE))],
)
async def unlink_device(
    asset_id: str,
    device_id: str,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> None:
    await am.unlink_device(asset_id, device_id)


@router.post(
    "/{asset_id}/commands",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def dispatch_asset_command(
    asset_id: str,
    body: AssetCommand,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
    commands_svc: Annotated[CommandsServiceInterface, Depends(get_commands_service)],
    user_id: Annotated[str, Depends(get_current_user_id)],
) -> BatchDispatchResponse:
    all_ids = await am.resolve_device_ids(asset_id, recursive=body.recursive)
    matching = dm.list_devices(ids=all_ids, device_type=body.device_type)
    device_ids = [d.id for d in matching]
    if not device_ids:
        msg = (
            f"No devices of type '{body.device_type}' found "
            f"in asset '{asset_id}' subtree"
        )
        raise NotFoundError(msg)
    data_type = resolve_attribute_data_type(dm, device_ids, body.attribute)
    commands = await commands_svc.dispatch_batch(
        device_ids=device_ids,
        attribute=body.attribute,
        value=body.value,
        data_type=data_type,
        user_id=user_id,
        confirm=body.confirm,
    )
    return to_batch_dispatch_response(commands)
