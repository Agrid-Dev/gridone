from typing import Annotated

from assets import (
    Asset,
    AssetCreate,
    AssetsManager,
    AssetUpdate,
    get_asset_create_schema,
)
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from api.dependencies import get_assets_manager

router = APIRouter()


class DeviceLinkRequest(BaseModel):
    device_id: str


@router.get("/schema")
async def get_schema() -> dict:
    """JSON schema of AssetCreate for frontend form validation."""
    return get_asset_create_schema()


@router.get("/tree")
async def get_tree(
    am: Annotated[AssetsManager, Depends(get_assets_manager)],
) -> list[dict]:
    return await am.get_tree()


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
