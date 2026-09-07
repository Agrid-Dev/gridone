from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from api.auth import get_current_user_id, require_permission
from api.dependencies import (
    get_assets_service,
    get_commands_service,
    get_device_manager,
    get_target_resolver,
)
from api.permissions import Permission
from api.schemas.command import AssetCommand, BatchDispatchResponse
from assets import (
    Asset,
    AssetCreate,
    AssetsService,
    AssetUpdate,
    AssetUsage,
    BuildingProfile,
    get_asset_create_schema,
    get_building_profile_schema,
)
from commands import AttributeWrite, CommandsServiceInterface
from devices_manager import DevicesServiceInterface
from models.targets import AttributeTarget, DevicesFilter, TargetResolver

router = APIRouter()


class ReorderRequest(BaseModel):
    ordered_ids: list[str]


class UsageBatchRequest(BaseModel):
    """Body of ``PATCH /assets/usage``: classify several assets at once."""

    asset_ids: list[str] = Field(..., min_length=1)
    usage: AssetUsage | None


class UsageBatchResponse(BaseModel):
    updated: int


@router.get(
    "/schema", dependencies=[Depends(require_permission(Permission.ASSETS_READ))]
)
async def get_schema() -> dict:
    """JSON schema of AssetCreate for frontend form validation."""
    return get_asset_create_schema()


@router.get(
    "/profile", dependencies=[Depends(require_permission(Permission.ASSETS_READ))]
)
async def get_building_profile(
    assets_svc: Annotated[AssetsService, Depends(get_assets_service)],
) -> BuildingProfile:
    return await assets_svc.get_profile()


@router.put(
    "/profile", dependencies=[Depends(require_permission(Permission.ASSETS_WRITE))]
)
async def set_building_profile(
    body: BuildingProfile,
    assets_svc: Annotated[AssetsService, Depends(get_assets_service)],
) -> BuildingProfile:
    return await assets_svc.set_profile(body)


@router.get(
    "/profile/schema",
    dependencies=[Depends(require_permission(Permission.ASSETS_READ))],
)
async def get_profile_schema() -> dict:
    """JSON schema of BuildingProfile for the frontend form."""
    return get_building_profile_schema()


@router.get("/tree", dependencies=[Depends(require_permission(Permission.ASSETS_READ))])
async def get_tree(
    assets_svc: Annotated[AssetsService, Depends(get_assets_service)],
) -> list[dict]:
    return await assets_svc.get_tree()


@router.get(
    "/tree-with-devices",
    dependencies=[Depends(require_permission(Permission.ASSETS_READ))],
)
async def get_tree_with_devices(
    assets_svc: Annotated[AssetsService, Depends(get_assets_service)],
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> list[dict]:
    tree = await assets_svc.get_tree()
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
    dependencies=[Depends(require_permission(Permission.ASSETS_READ))],
)
async def list_assets(
    assets_svc: Annotated[AssetsService, Depends(get_assets_service)],
    parent_id: str | None = Query(None),
    asset_type: str | None = Query(None, alias="type"),
    usage: AssetUsage | None = Query(None),
) -> list[Asset]:
    return await assets_svc.list_all(
        parent_id=parent_id, asset_type=asset_type, usage=usage
    )


@router.patch(
    "/usage",
    dependencies=[Depends(require_permission(Permission.ASSETS_WRITE))],
)
async def set_assets_usage(
    body: UsageBatchRequest,
    assets_svc: Annotated[AssetsService, Depends(get_assets_service)],
) -> UsageBatchResponse:
    """Classify room and zone assets in one call.

    The batch is applied whole or not at all: one id that is unknown or cannot
    carry a usage rejects the request with nothing modified.
    """
    updated = await assets_svc.set_usage(body.asset_ids, body.usage)
    return UsageBatchResponse(updated=updated)


@router.get(
    "/{asset_id}",
    dependencies=[Depends(require_permission(Permission.ASSETS_READ))],
)
async def get_asset(
    asset_id: str,
    assets_svc: Annotated[AssetsService, Depends(get_assets_service)],
) -> Asset:
    return await assets_svc.get_by_id(asset_id)


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.ASSETS_WRITE))],
)
async def create_asset(
    body: AssetCreate,
    assets_svc: Annotated[AssetsService, Depends(get_assets_service)],
) -> Asset:
    return await assets_svc.create_asset(body)


@router.put(
    "/{asset_id}",
    dependencies=[Depends(require_permission(Permission.ASSETS_WRITE))],
)
async def update_asset(
    asset_id: str,
    body: AssetUpdate,
    assets_svc: Annotated[AssetsService, Depends(get_assets_service)],
) -> Asset:
    return await assets_svc.update_asset(asset_id, body)


@router.delete(
    "/{asset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.ASSETS_WRITE))],
)
async def delete_asset(
    asset_id: str,
    assets_svc: Annotated[AssetsService, Depends(get_assets_service)],
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> None:
    linked_devices = dm.list_devices(tags={"asset_id": [asset_id]})
    for device in linked_devices:
        await dm.delete_device_tag(device.id, "asset_id")
    await assets_svc.delete_asset(asset_id)


@router.put(
    "/{asset_id}/children/order",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.ASSETS_WRITE))],
)
async def reorder_children(
    asset_id: str,
    body: ReorderRequest,
    assets_svc: Annotated[AssetsService, Depends(get_assets_service)],
) -> None:
    await assets_svc.reorder_siblings(asset_id, body.ordered_ids)


@router.get(
    "/{asset_id}/devices",
    dependencies=[Depends(require_permission(Permission.ASSETS_READ))],
)
async def list_asset_devices(
    asset_id: str,
    assets_svc: Annotated[AssetsService, Depends(get_assets_service)],
    dm: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> list[str]:
    await assets_svc.get_by_id(asset_id)
    return [d.id for d in dm.list_devices(tags={"asset_id": [asset_id]})]


@router.post(
    "/{asset_id}/commands",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_permission(Permission.DEVICES_WRITE))],
)
async def dispatch_asset_command(
    asset_id: str,
    body: AssetCommand,
    assets_svc: Annotated[AssetsService, Depends(get_assets_service)],
    resolver: Annotated[TargetResolver, Depends(get_target_resolver)],
    commands_svc: Annotated[CommandsServiceInterface, Depends(get_commands_service)],
    user_id: Annotated[str, Depends(get_current_user_id)],
) -> BatchDispatchResponse:
    await assets_svc.get_by_id(asset_id)
    asset_ids = [asset_id]
    if body.recursive:
        descendants = await assets_svc.get_descendants(asset_id)
        asset_ids.extend(a.id for a in descendants)
    target = DevicesFilter(
        tags={"asset_id": asset_ids},
        types=[body.device_type],
    )
    resolved = await resolver.resolve(
        AttributeTarget(devices=target, attribute=body.attribute),
        writable=True,
    )
    dispatch = await commands_svc.dispatch_batch(
        target=target,
        write=AttributeWrite(
            attribute=body.attribute, value=body.value, data_type=resolved.data_type
        ),
        user_id=user_id,
        confirm=body.confirm,
    )
    if not dispatch.commands:
        # Aligned with batch dispatch: an empty resolution is an invalid
        # request (422), not a missing resource.
        raise HTTPException(status_code=422, detail="Target resolved to no devices")
    return BatchDispatchResponse(batch_id=dispatch.batch_id, commands=dispatch.commands)
