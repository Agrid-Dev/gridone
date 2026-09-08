from assets.models import Asset, BuildingModel


class AssetInDB(Asset):
    """Internal storage model."""


class BuildingModelInDB(BuildingModel):
    """Internal storage model for a building's 3D model metadata."""


__all__ = ["AssetInDB", "BuildingModelInDB"]
