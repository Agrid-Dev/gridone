import asyncio
import logging
from collections import defaultdict
from datetime import UTC, datetime

from assets.models import (
    Asset,
    AssetCreate,
    AssetType,
    AssetUpdate,
    BuildingModel,
    BuildingModelStatus,
    BuildingProfile,
    ModelSpace,
    TreeImportResult,
)
from assets.storage import build_assets_storage
from assets.storage.models import AssetInDB, BuildingModelInDB
from assets.storage.storage_backend import AssetsStorageBackend
from models.errors import InvalidError, NotFoundError
from models.ids import gen_id
from models.service import Service

logger = logging.getLogger(__name__)

MAX_IFC_BYTES = 200 * 1024 * 1024

_INTERRUPTED_ERROR = (
    "Conversion was interrupted by a server restart. Upload the file again."
)


class AssetsService(Service):
    def __init__(self, storage_url: str | None) -> None:
        self._storage_url = storage_url
        self._storage: AssetsStorageBackend | None = None
        self._conversions: dict[str, asyncio.Task[None]] = {}

    async def start(self) -> None:
        self._storage = await build_assets_storage(self._storage_url)
        await self.ensure_default_root()
        await self._storage.fail_processing_models(
            _INTERRUPTED_ERROR, datetime.now(UTC)
        )

    async def stop(self) -> None:
        tasks = list(self._conversions.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._conversions.clear()
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
        # Unlike the other fields, ifc_global_id can be cleared: an explicit
        # null in the payload unlinks the 3D space, an omitted field keeps it.
        new_ifc_global_id = (
            data.ifc_global_id
            if "ifc_global_id" in data.model_fields_set
            else existing.ifc_global_id
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
            ifc_global_id=new_ifc_global_id,
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

    @staticmethod
    def _to_public_model(model: BuildingModelInDB) -> BuildingModel:
        return BuildingModel.model_validate(model.model_dump())

    async def _get_model_or_raise(self, asset_id: str) -> BuildingModelInDB:
        await self._get_or_raise(asset_id)
        model = await self._backend.get_model(asset_id)
        if model is None:
            msg = f"Asset '{asset_id}' has no 3D model"
            raise NotFoundError(msg)
        return model

    async def upload_model(
        self, asset_id: str, *, filename: str, data: bytes
    ) -> BuildingModel:
        """Store a raw IFC payload and start its conversion in the background.

        Replaces any previous model of the asset; an in-flight conversion for
        the same asset is cancelled first.
        """
        asset = await self._get_or_raise(asset_id)
        if asset.type != AssetType.BUILDING:
            msg = "A 3D model can only be attached to a building asset."
            raise InvalidError(msg)
        if not data:
            msg = "The uploaded file is empty."
            raise InvalidError(msg)
        if len(data) > MAX_IFC_BYTES:
            msg = "The IFC file exceeds the 200 MB limit."
            raise InvalidError(msg)

        now = datetime.now(UTC)
        model = BuildingModelInDB(
            asset_id=asset_id,
            status=BuildingModelStatus.PROCESSING,
            filename=filename,
            ifc_size=len(data),
            created_at=now,
            updated_at=now,
        )
        await self._backend.save_model(model, data)
        self._spawn_conversion(asset_id)
        return self._to_public_model(model)

    def _spawn_conversion(self, asset_id: str) -> None:
        existing = self._conversions.pop(asset_id, None)
        if existing is not None:
            existing.cancel()
        task = asyncio.create_task(self._convert_model(asset_id))
        self._conversions[asset_id] = task
        task.add_done_callback(lambda done: self._discard_conversion(asset_id, done))

    def _discard_conversion(self, asset_id: str, task: asyncio.Task[None]) -> None:
        if self._conversions.get(asset_id) is task:
            del self._conversions[asset_id]

    async def _convert_model(self, asset_id: str) -> None:
        from assets.conversion import ConversionError, convert_ifc  # noqa: PLC0415

        data = await self._backend.get_model_ifc(asset_id)
        if data is None:
            return
        try:
            result = await asyncio.to_thread(convert_ifc, data)
        except ConversionError as e:
            await self._store_conversion_failure(asset_id, str(e))
            return
        except Exception:
            logger.exception(
                "Building model conversion failed for asset '%s'", asset_id
            )
            await self._store_conversion_failure(
                asset_id, "Conversion failed unexpectedly."
            )
            return
        model = await self._backend.get_model(asset_id)
        if model is None:
            return
        await self._backend.set_model_result(
            model.model_copy(
                update={
                    "status": BuildingModelStatus.READY,
                    "storeys": result.storeys,
                    "spaces": result.spaces,
                    "error": None,
                    "updated_at": datetime.now(UTC),
                }
            ),
            result.glb,
        )

    async def _store_conversion_failure(self, asset_id: str, error: str) -> None:
        model = await self._backend.get_model(asset_id)
        if model is None:
            return
        await self._backend.set_model_result(
            model.model_copy(
                update={
                    "status": BuildingModelStatus.FAILED,
                    "storeys": [],
                    "spaces": [],
                    "error": error,
                    "updated_at": datetime.now(UTC),
                }
            ),
            None,
        )

    async def get_model(self, asset_id: str) -> BuildingModel:
        return self._to_public_model(await self._get_model_or_raise(asset_id))

    async def get_model_glb(self, asset_id: str) -> bytes:
        model = await self._get_model_or_raise(asset_id)
        if model.status != BuildingModelStatus.READY:
            msg = f"Asset '{asset_id}' has no ready 3D scene"
            raise NotFoundError(msg)
        glb = await self._backend.get_model_glb(asset_id)
        if glb is None:
            msg = f"Asset '{asset_id}' has no ready 3D scene"
            raise NotFoundError(msg)
        return glb

    async def get_model_spaces(self, asset_id: str) -> list[ModelSpace]:
        return (await self._get_model_or_raise(asset_id)).spaces

    async def delete_model(self, asset_id: str) -> None:
        await self._get_model_or_raise(asset_id)
        task = self._conversions.pop(asset_id, None)
        if task is not None:
            task.cancel()
        await self._backend.delete_model(asset_id)

    async def import_tree(self, asset_id: str) -> TreeImportResult:
        """Replace the building subtree with floors/rooms from the IFC model.

        Destructive: every descendant of the building is deleted, then floors
        are recreated from the model storeys and rooms from its spaces, with
        IFC GlobalIds stamped for the viewer mapping.
        """
        asset = await self._get_or_raise(asset_id)
        if asset.type != AssetType.BUILDING:
            msg = "Only building assets can import a tree from their 3D model."
            raise InvalidError(msg)
        model = await self._get_model_or_raise(asset_id)
        if model.status != BuildingModelStatus.READY:
            msg = "The 3D model is not ready yet."
            raise InvalidError(msg)
        if not model.storeys:
            msg = "The 3D model has no storeys to import."
            raise InvalidError(msg)

        await self._backend.delete_descendants(asset_id)

        now = datetime.now(UTC)
        floor_ids: dict[str, str] = {}
        for position, storey in enumerate(model.storeys):
            floor = AssetInDB(
                id=gen_id(),
                parent_id=asset_id,
                type=AssetType.FLOOR,
                name=storey.name,
                position=position,
                ifc_global_id=storey.global_id,
                created_at=now,
                updated_at=now,
            )
            await self._backend.save(floor)
            floor_ids[storey.global_id] = floor.id

        next_position: defaultdict[str, int] = defaultdict(int)
        # Spaces without a storey land directly under the building, after
        # the floors just created.
        next_position[asset_id] = len(floor_ids)
        for space in model.spaces:
            parent_id = floor_ids.get(space.storey_global_id or "", asset_id)
            room = AssetInDB(
                id=gen_id(),
                parent_id=parent_id,
                type=AssetType.ROOM,
                name=space.name,
                position=next_position[parent_id],
                ifc_global_id=space.global_id,
                created_at=now,
                updated_at=now,
            )
            next_position[parent_id] += 1
            await self._backend.save(room)

        return TreeImportResult(
            floors_created=len(floor_ids), rooms_created=len(model.spaces)
        )


__all__ = ["MAX_IFC_BYTES", "AssetsService"]
