from dataclasses import dataclass, field
from datetime import datetime

from assets.models import BuildingModelStatus
from assets.storage.models import BuildingModelInDB


@dataclass
class _StoredModel:
    meta: BuildingModelInDB
    ifc_data: bytes
    glb_data: bytes | None = None


@dataclass
class MemoryBuildingModelsStorage:
    _models: dict[str, _StoredModel] = field(default_factory=dict)

    async def get(self, asset_id: str) -> BuildingModelInDB | None:
        stored = self._models.get(asset_id)
        return stored.meta if stored else None

    async def save(self, model: BuildingModelInDB, ifc_data: bytes) -> None:
        meta = model.model_copy(update={"ifc_size": len(ifc_data), "glb_size": None})
        self._models[model.asset_id] = _StoredModel(meta=meta, ifc_data=ifc_data)

    async def set_result(
        self, model: BuildingModelInDB, glb_data: bytes | None
    ) -> None:
        stored = self._models.get(model.asset_id)
        if stored is None:
            return
        stored.glb_data = glb_data
        stored.meta = model.model_copy(
            update={
                "ifc_size": stored.meta.ifc_size,
                "glb_size": len(glb_data) if glb_data is not None else None,
            }
        )

    async def fail_processing(self, error: str, updated_at: datetime) -> None:
        for stored in self._models.values():
            if stored.meta.status == BuildingModelStatus.PROCESSING:
                stored.meta = stored.meta.model_copy(
                    update={
                        "status": BuildingModelStatus.FAILED,
                        "error": error,
                        "updated_at": updated_at,
                    }
                )

    async def list_stale_ready_ids(self, current_version: int) -> list[str]:
        return [
            asset_id
            for asset_id, stored in self._models.items()
            if stored.meta.status == BuildingModelStatus.READY
            and stored.meta.converter_version < current_version
        ]

    async def get_ifc(self, asset_id: str) -> bytes | None:
        stored = self._models.get(asset_id)
        return stored.ifc_data if stored else None

    async def get_glb(self, asset_id: str) -> bytes | None:
        stored = self._models.get(asset_id)
        return stored.glb_data if stored else None

    async def delete(self, asset_id: str) -> None:
        self._models.pop(asset_id, None)

    async def delete_many(self, asset_ids: list[str]) -> None:
        for asset_id in asset_ids:
            self._models.pop(asset_id, None)

    async def close(self) -> None:
        pass


__all__ = ["MemoryBuildingModelsStorage"]
