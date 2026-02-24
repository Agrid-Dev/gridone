from typing import Annotated

from assets import (
    Asset,
    AssetCreate,
    AssetsManager,
    AssetUpdate,
    get_asset_create_schema,
)
from devices_manager import DevicesManager
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from api.dependencies import get_assets_manager, get_device_manager

router = APIRouter()


class DeviceLinkRequest(BaseModel):
    device_id: str


class ReorderRequest(BaseModel):
    ordered_ids: list[str]


@router.get("/schema")
async def get_schema() -> dict:
    """JSON schema of AssetCreate for frontend form validation."""
    return get_asset_create_schema()


@router.get("/tree")
async def get_tree(
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> list[dict]:
    return await am.get_tree()


@router.get("/tree-with-devices")
async def get_tree_with_devices(
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
    dm: Annotated[DevicesManager, Depends(get_device_manager)],
) -> list[dict]:
    tree = await am.get_tree()
    all_links = await am.get_all_device_links()
    name_map = {d.id: d.name for d in dm.list_devices()}

    def enrich(nodes: list[dict]) -> None:
        for node in nodes:
            device_ids = all_links.get(node["id"], [])
            node["devices"] = [
                {"id": did, "name": name_map.get(did, did)}
                for did in device_ids
            ]
            enrich(node["children"])

    enrich(tree)
    return tree


@router.get("/", response_model=list[Asset])
async def list_assets(
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
    parent_id: str | None = Query(None),
    type: str | None = Query(None),
) -> list[Asset]:
    return await am.list_all(parent_id=parent_id, asset_type=type)


@router.get("/{asset_id}", response_model=Asset)
async def get_asset(
    asset_id: str,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> Asset:
    return await am.get_by_id(asset_id)


@router.post("/", response_model=Asset, status_code=status.HTTP_201_CREATED)
async def create_asset(
    body: AssetCreate,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> Asset:
    return await am.create_asset(body)


@router.put("/{asset_id}", response_model=Asset)
async def update_asset(
    asset_id: str,
    body: AssetUpdate,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> Asset:
    return await am.update_asset(asset_id, body)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: str,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> None:
    await am.delete_asset(asset_id)


@router.put("/{asset_id}/children/order", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_children(
    asset_id: str,
    body: ReorderRequest,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> None:
    await am.reorder_siblings(asset_id, body.ordered_ids)


# Device linking endpoints


@router.get("/{asset_id}/devices", response_model=list[str])
async def list_asset_devices(
    asset_id: str,
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> list[str]:
    return await am.get_device_ids(asset_id)


@router.post("/{asset_id}/devices", status_code=status.HTTP_201_CREATED)
async def link_device(
    asset_id: str,
    body: DeviceLinkRequest,
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
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> None:
    await am.unlink_device(asset_id, device_id)
