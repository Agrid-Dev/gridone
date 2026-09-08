"""Interfaces the assets package exposes to its consumers.

``AssetsService`` needs a building's storeys and spaces to import a tree; it
gets them through this protocol rather than through ``BuildingModelsService``
itself, so the dependency points at a contract and tests can substitute a
fake without a converter or a storage backend.
"""

from typing import Protocol

from assets.models import BuildingModel, ModelSpace


class BuildingModelsServiceInterface(Protocol):
    """The 3D model of a building, keyed by the id of its asset."""

    async def upload(
        self, asset_id: str, *, filename: str, data: bytes
    ) -> BuildingModel: ...

    async def regenerate(self, asset_id: str) -> BuildingModel: ...

    async def get(self, asset_id: str) -> BuildingModel:
        """Raise ``NotFoundError`` when the asset carries no model."""
        ...

    async def get_scene(self, asset_id: str) -> bytes:
        """Raise ``NotFoundError`` until the scene has been converted."""
        ...

    async def get_spaces(self, asset_id: str) -> list[ModelSpace]: ...

    async def delete(self, asset_id: str) -> None:
        """Raise ``NotFoundError`` when the asset carries no model."""
        ...

    async def discard(self, asset_ids: list[str]) -> None:
        """Drop the models of *asset_ids*, ignoring those that carry none."""
        ...


__all__ = ["BuildingModelsServiceInterface"]
