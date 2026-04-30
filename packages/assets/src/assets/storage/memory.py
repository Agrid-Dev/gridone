from dataclasses import dataclass, field

from assets.storage.models import AssetInDB


@dataclass
class MemoryAssetsStorage:
    _assets: dict[str, AssetInDB] = field(default_factory=dict)

    def _path_for(self, asset: AssetInDB) -> list[str]:
        if asset.parent_id is None:
            return [asset.id]
        parent = self._assets.get(asset.parent_id)
        if parent is None:
            return [asset.id]
        return [*parent.path, asset.id]

    @staticmethod
    def _sort_key(asset: AssetInDB) -> tuple[list[str], int, str]:
        return (asset.path, asset.position, asset.name)

    async def get_by_id(self, asset_id: str) -> AssetInDB | None:
        return self._assets.get(asset_id)

    async def list_all(self) -> list[AssetInDB]:
        return sorted(self._assets.values(), key=self._sort_key)

    async def list_by_parent(self, parent_id: str | None) -> list[AssetInDB]:
        return sorted(
            (asset for asset in self._assets.values() if asset.parent_id == parent_id),
            key=lambda asset: (asset.position, asset.name),
        )

    async def save(self, asset: AssetInDB) -> None:
        self._assets[asset.id] = asset.model_copy(
            update={"path": self._path_for(asset)}
        )

    async def delete(self, asset_id: str) -> None:
        self._assets.pop(asset_id, None)

    async def get_children(self, asset_id: str) -> list[AssetInDB]:
        return await self.list_by_parent(asset_id)

    async def get_descendants(self, asset_id: str) -> list[AssetInDB]:
        asset = self._assets.get(asset_id)
        if asset is None:
            return []
        prefix = asset.path
        return sorted(
            (
                candidate
                for candidate in self._assets.values()
                if candidate.id != asset_id and candidate.path[: len(prefix)] == prefix
            ),
            key=self._sort_key,
        )

    async def update_descendant_paths(self, asset_id: str) -> None:
        asset = self._assets.get(asset_id)
        if asset is None:
            return
        await self.save(asset)
        for child in await self.list_by_parent(asset_id):
            await self.update_descendant_paths(child.id)

    async def get_next_position(self, parent_id: str) -> int:
        children = await self.list_by_parent(parent_id)
        if not children:
            return 0
        return max(child.position for child in children) + 1

    async def reorder_siblings(self, parent_id: str, ordered_ids: list[str]) -> None:
        for position, asset_id in enumerate(ordered_ids):
            asset = self._assets.get(asset_id)
            if asset is not None and asset.parent_id == parent_id:
                self._assets[asset_id] = asset.model_copy(update={"position": position})

    async def close(self) -> None:
        pass


__all__ = ["MemoryAssetsStorage"]
