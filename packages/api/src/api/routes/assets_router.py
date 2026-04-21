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
    resolve_attribute_data_type_for_target,
    to_batch_dispatch_response,
)
from api.schemas.command import AssetCommand, BatchDispatchResponse

router = APIRouter()


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
    all_devices = dm.list_devices()
    name_map = {d.id: d.name for d in all_devices}
    links: dict[str, list[str]] = {}
    for device in all_devices:
        if linked_asset_id := device.tags.get("asset_id"):
            links.setdefault(linked_asset_id, []).append(device.id)

    def enrich(nodes: list[dict]) -> None:
        for node in nodes:
            device_ids = links.get(node["id"], [])
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
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
) -> None:
    linked_devices = dm.list_devices(tags={"asset_id": [asset_id]})
    for device in linked_devices:
        await dm.delete_device_tag(device.id, "asset_id")
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


@router.get(
    "/{asset_id}/devices",
    response_model=list[str],
    dependencies=[Depends(require_permission(Permission.ASSETS_READ))],
)
async def list_asset_devices(
    asset_id: str,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
    dm: Annotated[DevicesManagerInterface, Depends(get_device_manager)],
) -> list[str]:
    await am.get_by_id(asset_id)
    return [d.id for d in dm.list_devices(tags={"asset_id": [asset_id]})]


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
    await am.get_by_id(asset_id)
    asset_ids = [asset_id]
    if body.recursive:
        descendants = await am.get_descendants(asset_id)
        asset_ids.extend(a.id for a in descendants)
    target: dict = {
        "tags": {"asset_id": asset_ids},
        "types": [body.device_type],
    }
    data_type = resolve_attribute_data_type_for_target(dm, target, body.attribute)
    commands = await commands_svc.dispatch_batch(
        target=target,
        attribute=body.attribute,
        value=body.value,
        data_type=data_type,
        user_id=user_id,
        confirm=body.confirm,
    )
    if not commands:
        msg = f"No devices of type '{body.device_type}' found in asset '{asset_id}'"
        raise NotFoundError(msg)
    return to_batch_dispatch_response(commands)
