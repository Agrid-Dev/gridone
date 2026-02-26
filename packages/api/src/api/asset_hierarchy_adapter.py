from assets import AssetsManager
from models.errors import NotFoundError


class AssetHierarchyAdapter:
    """Adapts AssetsManager to the AssetHierarchyProvider protocol
    expected by the AuthorizationService."""

    def __init__(self, assets_manager: AssetsManager) -> None:
        self._am = assets_manager

    async def get_ancestor_ids(self, asset_id: str) -> list[str]:
        """Return ordered list [asset_id, parent_id, ..., root_id]."""
        result = [asset_id]
        try:
            current = await self._am.get_by_id(asset_id)
        except NotFoundError:
            return result
        while current.parent_id is not None:
            result.append(current.parent_id)
            current = await self._am.get_by_id(current.parent_id)
        return result

    async def get_descendant_ids(self, asset_id: str) -> list[str]:
        return await self._am.get_descendant_ids(asset_id)

    async def get_asset_ids_for_device(self, device_id: str) -> list[str]:
        return await self._am.get_asset_ids_for_device(device_id)

    async def get_root_asset_ids(self) -> list[str]:
        return await self._am.get_root_ids()
