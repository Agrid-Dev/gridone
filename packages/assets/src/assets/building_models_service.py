import asyncio
import logging
from datetime import UTC, datetime

from assets.conversion import ConversionError, ConversionResult, SceneConverter
from assets.models import BuildingModel, BuildingModelStatus, ModelSpace
from assets.storage import build_building_models_storage
from assets.storage.building_models_backend import BuildingModelsStorageBackend
from assets.storage.models import BuildingModelInDB
from models.errors import InvalidError, NotFoundError
from models.service import Service

logger = logging.getLogger(__name__)

MAX_IFC_BYTES = 200 * 1024 * 1024

_INTERRUPTED_ERROR = (
    "Conversion was interrupted by a server restart. Upload the file again."
)


class BuildingModelsService(Service):
    """Owns the 3D model of a building: its file, its scene, its conversions.

    ``asset_id`` is an opaque key — this service never reads the asset tree,
    so nothing here knows what a building is. The rule that only a building
    may carry a model belongs to ``AssetsService``, which owns asset types.
    """

    def __init__(self, storage_url: str | None, converter: SceneConverter) -> None:
        self._storage_url = storage_url
        self._converter = converter
        self._storage: BuildingModelsStorageBackend | None = None
        self._conversions: dict[str, asyncio.Task[None]] = {}
        self._regen_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._storage = await build_building_models_storage(self._storage_url)
        # A conversion is an in-process task: nothing survived the restart, so
        # rows still claiming to be running are stale by definition.
        await self._backend.fail_processing(_INTERRUPTED_ERROR, datetime.now(UTC))
        await self.rebuild_stale_scenes()

    async def stop(self) -> None:
        tasks = list(self._conversions.values())
        if self._regen_task is not None:
            tasks.append(self._regen_task)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._conversions.clear()
        self._regen_task = None
        if self._storage is not None:
            await self._storage.close()
            self._storage = None

    @property
    def _backend(self) -> BuildingModelsStorageBackend:
        if self._storage is None:
            msg = "BuildingModelsService.start() must be called before use"
            raise RuntimeError(msg)
        return self._storage

    @staticmethod
    def _to_public(model: BuildingModelInDB) -> BuildingModel:
        return BuildingModel.model_validate(model.model_dump())

    async def _get_or_raise(self, asset_id: str) -> BuildingModelInDB:
        model = await self._backend.get(asset_id)
        if model is None:
            msg = f"Asset '{asset_id}' has no 3D model"
            raise NotFoundError(msg)
        return model

    async def upload(
        self, asset_id: str, *, filename: str, data: bytes
    ) -> BuildingModel:
        """Store a raw IFC payload and start its conversion in the background.

        Replaces any previous model of the asset; an in-flight conversion for
        the same asset is cancelled first.
        """
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
        await self._backend.save(model, data)
        self._spawn_conversion(asset_id)
        return self._to_public(model)

    async def regenerate(self, asset_id: str) -> BuildingModel:
        """Re-run the conversion on the IFC payload already stored.

        The scene is a derived artifact of one converter version: when the
        contract gains a category — an outer envelope, say — models converted
        earlier keep the old shape until they are converted again. This
        replays the conversion without asking for the file a second time.
        """
        model = await self._get_or_raise(asset_id)
        if await self._backend.get_ifc(asset_id) is None:
            msg = "The original IFC file is no longer available for this asset."
            raise InvalidError(msg)

        processing = model.model_copy(
            update={
                "status": BuildingModelStatus.PROCESSING,
                "error": None,
                "updated_at": datetime.now(UTC),
            }
        )
        # Clearing the scene keeps the viewer honest while the new one builds,
        # and matches what a fresh upload does.
        await self._backend.set_result(processing, None)
        self._spawn_conversion(asset_id)
        return self._to_public(processing)

    def _spawn_conversion(self, asset_id: str) -> None:
        existing = self._conversions.pop(asset_id, None)
        if existing is not None:
            existing.cancel()
        task = asyncio.create_task(self._convert(asset_id))
        self._conversions[asset_id] = task
        task.add_done_callback(lambda done: self._discard_conversion(asset_id, done))

    def _discard_conversion(self, asset_id: str, task: asyncio.Task[None]) -> None:
        if self._conversions.get(asset_id) is task:
            del self._conversions[asset_id]

    async def wait_for_conversions(self) -> None:
        """Await every conversion in flight, background rebuilds included.

        Conversions run as detached tasks so an upload answers immediately;
        this is how a caller that needs the scene — a test, a batch import —
        joins them without reaching into the service.
        """
        tasks = list(self._conversions.values())
        if self._regen_task is not None:
            tasks.append(self._regen_task)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _convert(self, asset_id: str) -> None:
        data = await self._backend.get_ifc(asset_id)
        if data is None:
            return
        try:
            result = await asyncio.to_thread(self._converter.convert, data)
        except ConversionError as e:
            await self._store_failure(asset_id, str(e))
            return
        except Exception:
            logger.exception(
                "Building model conversion failed for asset '%s'", asset_id
            )
            await self._store_failure(asset_id, "Conversion failed unexpectedly.")
            return
        await self._store_success(asset_id, result)

    async def rebuild_stale_scenes(self) -> None:
        """Rebuild ``ready`` scenes left stale by a converter upgrade.

        The stored scene is a derived artifact of one converter version; when
        the contract changes, older scenes keep the old shape until rebuilt.
        This runs the rebuilds one at a time in the background so a deploy
        never blocks on conversion nor floods the CPU, and — unlike a manual
        regenerate — it keeps the existing scene visible until the new one is
        ready, and on failure leaves it untouched rather than blanking it.
        """
        stale = await self._backend.list_stale_ready_ids(self._converter.version)
        if not stale:
            return
        logger.info(
            "Rebuilding %d stale 3D scene(s) after a converter upgrade to v%d",
            len(stale),
            self._converter.version,
        )
        self._regen_task = asyncio.create_task(self._rebuild(stale))

    async def _rebuild(self, asset_ids: list[str]) -> None:
        for asset_id in asset_ids:
            before = await self._backend.get(asset_id)
            data = await self._backend.get_ifc(asset_id)
            if before is None or data is None:
                continue
            try:
                result = await asyncio.to_thread(self._converter.convert, data)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "Background rebuild failed for asset '%s'; keeping the "
                    "existing scene",
                    asset_id,
                )
                continue
            if not await self._still_owns(asset_id, before):
                continue
            await self._store_success(asset_id, result)
            logger.info(
                "Rebuilt 3D scene for asset '%s' (converter v%d)",
                asset_id,
                self._converter.version,
            )

    async def _still_owns(self, asset_id: str, before: BuildingModelInDB) -> bool:
        """Whether the row this rebuild started from is still the current one.

        A rebuild is slow and runs while the API already serves: an upload or a
        regenerate landing meanwhile replaces the payload, and it is not
        registered in ``_conversions``, so nothing cancels the rebuild. Storing
        anyway would put the superseded scene back under the new file *and*
        stamp it with the current converter version — leaving a model that
        looks up to date and is never picked up as stale again.
        """
        current = await self._backend.get(asset_id)
        if current is not None and current.updated_at == before.updated_at:
            return True
        logger.info(
            "Dropping the rebuilt scene for asset '%s': a newer conversion "
            "took over while it was building",
            asset_id,
        )
        return False

    async def _store_success(self, asset_id: str, result: ConversionResult) -> None:
        """Publish a converted scene, unless the model was deleted meanwhile."""
        model = await self._backend.get(asset_id)
        if model is None:
            return
        await self._backend.set_result(
            model.model_copy(
                update={
                    "status": BuildingModelStatus.READY,
                    "storeys": result.storeys,
                    "spaces": result.spaces,
                    "converter_version": self._converter.version,
                    "error": None,
                    "updated_at": datetime.now(UTC),
                }
            ),
            result.glb,
        )

    async def _store_failure(self, asset_id: str, error: str) -> None:
        model = await self._backend.get(asset_id)
        if model is None:
            return
        await self._backend.set_result(
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

    async def get(self, asset_id: str) -> BuildingModel:
        return self._to_public(await self._get_or_raise(asset_id))

    async def get_scene(self, asset_id: str) -> bytes:
        model = await self._get_or_raise(asset_id)
        if model.status != BuildingModelStatus.READY:
            msg = f"Asset '{asset_id}' has no ready 3D scene"
            raise NotFoundError(msg)
        glb = await self._backend.get_glb(asset_id)
        if glb is None:
            msg = f"Asset '{asset_id}' has no ready 3D scene"
            raise NotFoundError(msg)
        return glb

    async def get_spaces(self, asset_id: str) -> list[ModelSpace]:
        return (await self._get_or_raise(asset_id)).spaces

    async def delete(self, asset_id: str) -> None:
        await self._get_or_raise(asset_id)
        self._cancel_conversion(asset_id)
        await self._backend.delete(asset_id)

    async def discard(self, asset_ids: list[str]) -> None:
        """Drop the models of *asset_ids*, ignoring those that carry none.

        Called when the assets themselves go away. Postgres would cascade on
        the foreign key, but doing it here keeps every backend — the in-memory
        one included — agreeing on what a deleted asset leaves behind.
        """
        if not asset_ids:
            return
        for asset_id in asset_ids:
            self._cancel_conversion(asset_id)
        await self._backend.delete_many(asset_ids)

    def _cancel_conversion(self, asset_id: str) -> None:
        task = self._conversions.pop(asset_id, None)
        if task is not None:
            task.cancel()


__all__ = ["MAX_IFC_BYTES", "BuildingModelsService"]
