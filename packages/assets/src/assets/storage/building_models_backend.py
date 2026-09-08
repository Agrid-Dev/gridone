from datetime import datetime
from typing import Protocol

from assets.storage.models import BuildingModelInDB


class BuildingModelsStorageBackend(Protocol):
    """Storage of a building's 3D model: metadata plus two binary payloads.

    ``asset_id`` is an opaque key here — this backend never reads the asset
    tree. Keeping the raw IFC alongside the scene is what makes a rebuild
    possible without asking the operator for the file again.
    """

    async def get(self, asset_id: str) -> BuildingModelInDB | None:
        """Return the model metadata for *asset_id* (binary payloads excluded)."""
        ...

    async def save(self, model: BuildingModelInDB, ifc_data: bytes) -> None:
        """Upsert the model row with a fresh IFC payload, clearing any glTF."""
        ...

    async def set_result(
        self, model: BuildingModelInDB, glb_data: bytes | None
    ) -> None:
        """Persist the conversion outcome carried by *model* plus its scene.

        The raw IFC payload is left untouched; sizes are derived on read.
        """
        ...

    async def fail_processing(self, error: str, updated_at: datetime) -> None:
        """Mark every model still in ``processing`` as failed with *error*."""
        ...

    async def list_stale_ready_ids(self, current_version: int) -> list[str]:
        """Asset ids of ``ready`` models built by an older converter.

        Used on startup to rebuild scenes whose contract has since changed.
        """
        ...

    async def get_ifc(self, asset_id: str) -> bytes | None: ...
    async def get_glb(self, asset_id: str) -> bytes | None: ...

    async def delete(self, asset_id: str) -> None: ...

    async def delete_many(self, asset_ids: list[str]) -> None:
        """Drop the models of *asset_ids*, ignoring those that carry none."""
        ...

    async def close(self) -> None: ...
