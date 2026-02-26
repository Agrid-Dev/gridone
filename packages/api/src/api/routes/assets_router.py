from typing import Annotated

from assets import (
    Asset,
    AssetCreate,
    AssetsManager,
    AssetUpdate,
    get_asset_create_schema,
)
from devices_manager import DevicesManager
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from users import AuthorizationService, Permission
from api.dependencies import (
    get_assets_manager,
    get_authorization_service,
    get_current_user_id,
    get_device_manager,
    require_asset_permission,
    require_permission,
)

router = APIRouter()


class DeviceLinkRequest(BaseModel):
    device_id: str


class ReorderRequest(BaseModel):
    ordered_ids: list[str]


def _filter_tree(tree: list[dict], accessible: set[str]) -> list[dict]:
    """Keep only nodes that are in the accessible set or have accessible descendants."""
    result = []
    for node in tree:
        filtered_children = _filter_tree(node.get("children", []), accessible)
        if node["id"] in accessible or filtered_children:
            result.append({**node, "children": filtered_children})
    return result


@router.get("/schema")
async def get_schema(
    _: Annotated[str, Depends(require_permission(Permission.ASSETS_READ))],
) -> dict:
    """JSON schema of AssetCreate for frontend form validation."""
    return get_asset_create_schema()


@router.get("/tree")
async def get_tree(
    user_id: Annotated[str, Depends(get_current_user_id)],
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
    authz: Annotated[AuthorizationService, Depends(get_authorization_service)],
) -> list[dict]:
    has_perm = await authz.check_permission(user_id, Permission.ASSETS_READ)
    if not has_perm:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing permission: assets:read",
        )
    tree = await am.get_tree()
    accessible = await authz.get_accessible_asset_ids(user_id, Permission.ASSETS_READ)
    if accessible is None:
        return tree
    return _filter_tree(tree, accessible)


@router.get("/tree-with-devices")
async def get_tree_with_devices(
    user_id: Annotated[str, Depends(get_current_user_id)],
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
    authz: Annotated[AuthorizationService, Depends(get_authorization_service)],
) -> list[dict]:
    has_perm = await authz.check_permission(user_id, Permission.ASSETS_READ)
    if not has_perm:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing permission: assets:read",
        )
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
    accessible = await authz.get_accessible_asset_ids(user_id, Permission.ASSETS_READ)
    if accessible is None:
        return tree
    return _filter_tree(tree, accessible)


@router.get("/", response_model=list[Asset])
async def list_assets(
    user_id: Annotated[str, Depends(get_current_user_id)],
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
    authz: Annotated[AuthorizationService, Depends(get_authorization_service)],
    parent_id: str | None = Query(None),
    type: str | None = Query(None),
) -> list[Asset]:
    has_perm = await authz.check_permission(user_id, Permission.ASSETS_READ)
    if not has_perm:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing permission: assets:read",
        )
    assets = await am.list_all(parent_id=parent_id, asset_type=type)
    accessible = await authz.get_accessible_asset_ids(user_id, Permission.ASSETS_READ)
    if accessible is None:
        return assets
    return [a for a in assets if a.id in accessible]


@router.get("/{asset_id}", response_model=Asset)
async def get_asset(
    asset_id: str,
    _: Annotated[str, Depends(require_asset_permission(Permission.ASSETS_READ))],
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> Asset:
    return await am.get_by_id(asset_id)


@router.post("/", response_model=Asset, status_code=status.HTTP_201_CREATED)
async def create_asset(
    body: AssetCreate,
    user_id: Annotated[str, Depends(get_current_user_id)],
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
    authz: Annotated[AuthorizationService, Depends(get_authorization_service)],
) -> Asset:
    # Check assets:manage on the parent asset
    has_perm = await authz.check_permission(
        user_id, Permission.ASSETS_MANAGE, body.parent_id
    )
    if not has_perm:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing permission: assets:manage",
        )
    return await am.create_asset(body)


@router.put("/{asset_id}", response_model=Asset)
async def update_asset(
    asset_id: str,
    body: AssetUpdate,
    _: Annotated[str, Depends(require_asset_permission(Permission.ASSETS_MANAGE))],
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> Asset:
    return await am.update_asset(asset_id, body)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: str,
    _: Annotated[str, Depends(require_asset_permission(Permission.ASSETS_MANAGE))],
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> None:
    await am.delete_asset(asset_id)


@router.put("/{asset_id}/children/order", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_children(
    asset_id: str,
    body: ReorderRequest,
    _: Annotated[str, Depends(require_asset_permission(Permission.ASSETS_MANAGE))],
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> None:
    await am.reorder_siblings(asset_id, body.ordered_ids)


# Device linking endpoints


@router.get("/{asset_id}/devices", response_model=list[str])
async def list_asset_devices(
    asset_id: str,
    _: Annotated[str, Depends(require_asset_permission(Permission.ASSETS_READ))],
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> list[str]:
    return await am.get_device_ids(asset_id)


@router.post("/{asset_id}/devices", status_code=status.HTTP_201_CREATED)
async def link_device(
    asset_id: str,
    body: DeviceLinkRequest,
    _: Annotated[str, Depends(require_asset_permission(Permission.ASSETS_MANAGE))],
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> None:
    await am.link_device(asset_id, body.device_id)


@router.delete(
    "/{asset_id}/devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unlink_device(
    asset_id: str,
    device_id: str,
    _: Annotated[str, Depends(require_asset_permission(Permission.ASSETS_MANAGE))],
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> None:
    await am.unlink_device(asset_id, device_id)
