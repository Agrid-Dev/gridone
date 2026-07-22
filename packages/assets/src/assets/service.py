from datetime import UTC, datetime

from assets.models import (
    Asset,
    AssetCreate,
    AssetType,
    AssetUpdate,
    BuildingProfile,
)
from assets.storage import build_assets_storage
from assets.storage.models import AssetInDB
from assets.storage.storage_backend import AssetsStorageBackend
from models.errors import InvalidError, NotFoundError
from models.ids import gen_id
from models.service import Service


class AssetsService(Service):
    def __init__(self, storage_url: str | None) -> None:
        self._storage_url = storage_url
        self._storage: AssetsStorageBackend | None = None

    async def start(self) -> None:
        self._storage = await build_assets_storage(self._storage_url)
        await self.ensure_default_root()

    async def stop(self) -> None:
        if self._storage is not None:
            await self._storage.close()
            self._storage = None

    @property
    def _backend(self) -> AssetsStorageBackend:
        if self._storage is None:
            msg = "AssetsService.start() must be called before use"
            raise RuntimeError(msg)
        return self._storage

    @staticmethod
    def _to_public(asset: AssetInDB) -> Asset:
        return Asset.model_validate(asset.model_dump())

    async def _get_or_raise(self, asset_id: str) -> AssetInDB:
        asset = await self._backend.get_by_id(asset_id)
        if asset is None:
            msg = f"Asset '{asset_id}' not found"
            raise NotFoundError(msg)
        return asset

    async def ensure_default_root(self) -> None:
        """Create the default root organization if no assets exist."""
        roots = await self._backend.list_by_parent(None)
        if roots:
            return
        root = AssetInDB(
            id=gen_id(),
            parent_id=None,
            type=AssetType.ORG,
            name="Organization",
        )
        await self._backend.save(root)

    async def get_profile(self) -> BuildingProfile:
        """Return the building profile, or an empty default if unset."""
        return await self._backend.get_profile() or BuildingProfile()

    async def set_profile(self, update: BuildingProfile) -> BuildingProfile:
        """Upsert the singleton building profile, merging in only set fields.

        Fields omitted from *update* keep their stored value; passing an
        explicit ``null`` clears a field.
        """
        current = await self.get_profile()
        merged = current.model_copy(update=update.model_dump(exclude_unset=True))
        await self._backend.save_profile(merged)
        return merged

    async def get_by_id(self, asset_id: str) -> Asset:
        asset = await self._get_or_raise(asset_id)
        return self._to_public(asset)

    async def list_all(
        self,
        *,
        parent_id: str | None = None,
        asset_type: str | None = None,
    ) -> list[Asset]:
        if parent_id is not None:
            assets = await self._backend.list_by_parent(parent_id)
        else:
            assets = await self._backend.list_all()

        result = [self._to_public(a) for a in assets]

        if asset_type is not None:
            result = [a for a in result if a.type == asset_type]

        return result

    async def get_tree(self) -> list[dict]:
        all_assets = await self._backend.list_all()
        by_parent: dict[str | None, list[Asset]] = {}
        for a in all_assets:
            pub = self._to_public(a)
            by_parent.setdefault(a.parent_id, []).append(pub)

        def build(pid: str | None) -> list[dict]:
            children = sorted(
                by_parent.get(pid, []),
                key=lambda a: (a.position, a.name),
            )
            return [
                {**child.model_dump(), "children": build(child.id)}
                for child in children
            ]

        return build(None)

    async def create_asset(self, data: AssetCreate) -> Asset:
        parent = await self._backend.get_by_id(data.parent_id)
        if parent is None:
            msg = f"Parent asset '{data.parent_id}' not found"
            raise NotFoundError(msg)

        asset_id = gen_id()
        position = await self._backend.get_next_position(data.parent_id)
        asset = AssetInDB(
            id=asset_id,
            parent_id=data.parent_id,
            type=data.type,
            name=data.name,
            position=position,
        )
        await self._backend.save(asset)

        # Re-fetch to get the computed path from the trigger
        saved = await self._get_or_raise(asset_id)
        return self._to_public(saved)

    async def update_asset(self, asset_id: str, data: AssetUpdate) -> Asset:
        existing = await self._get_or_raise(asset_id)

        new_name = data.name if data.name is not None else existing.name
        new_type = data.type if data.type is not None else existing.type
        new_parent_id = (
            data.parent_id if data.parent_id is not None else existing.parent_id
        )

        # Check for circular dependency if parent is changing
        if new_parent_id != existing.parent_id and new_parent_id is not None:
            # Walk up the proposed parent chain to ensure asset_id is not an ancestor
            current = new_parent_id
            while current is not None:
                if current == asset_id:
                    msg = "Cannot set parent: would create a circular dependency"
                    raise InvalidError(msg)
                ancestor = await self._backend.get_by_id(current)
                if ancestor is None:
                    msg = f"Parent asset '{new_parent_id}' not found"
                    raise NotFoundError(msg)
                current = ancestor.parent_id

        # Validate: if becoming root, check no other root exists
        if new_parent_id is None and existing.parent_id is not None:
            roots = await self._backend.list_by_parent(None)
            other_roots = [r for r in roots if r.id != asset_id]
            if other_roots:
                msg = "A root asset already exists"
                raise InvalidError(msg)

        updated = AssetInDB(
            id=asset_id,
            parent_id=new_parent_id,
            type=new_type,
            name=new_name,
            position=existing.position,
            created_at=existing.created_at,
            updated_at=datetime.now(UTC),
        )
        await self._backend.save(updated)

        # If parent changed, update all descendant paths
        if new_parent_id != existing.parent_id:
            await self._backend.update_descendant_paths(asset_id)

        saved = await self._get_or_raise(asset_id)
        return self._to_public(saved)

    async def delete_asset(self, asset_id: str) -> None:
        asset = await self._get_or_raise(asset_id)
        if asset.parent_id is None:
            msg = "Cannot delete the root asset."
            raise InvalidError(msg)
        children = await self._backend.get_children(asset_id)
        if children:
            msg = "Cannot delete asset with children. Remove children first."
            raise InvalidError(msg)
        await self._backend.delete(asset_id)

    async def get_descendants(self, asset_id: str) -> list[Asset]:
        await self._get_or_raise(asset_id)
        assets = await self._backend.get_descendants(asset_id)
        return [self._to_public(a) for a in assets]

    async def reorder_siblings(self, parent_id: str, ordered_ids: list[str]) -> None:
        await self._get_or_raise(parent_id)
        await self._backend.reorder_siblings(parent_id, ordered_ids, datetime.now(UTC))


__all__ = ["AssetsService"]
