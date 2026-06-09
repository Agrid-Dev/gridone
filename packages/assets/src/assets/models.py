from enum import StrEnum

from pydantic import BaseModel, Field

ASSET_NAME_MIN_LENGTH = 1
ASSET_NAME_MAX_LENGTH = 128


class AssetType(StrEnum):
    """Allowed asset hierarchy types."""

    ORG = "org"
    BUILDING = "building"
    FLOOR = "floor"
    ROOM = "room"
    ZONE = "zone"


class Asset(BaseModel):
    """Public asset model (API response)."""

    id: str
    parent_id: str | None = None
    type: AssetType
    name: str
    path: list[str] = Field(default_factory=list)
    position: int = 0


class AssetCreate(BaseModel):
    """DTO for creating an asset."""

    name: str = Field(
        ...,
        min_length=ASSET_NAME_MIN_LENGTH,
        max_length=ASSET_NAME_MAX_LENGTH,
        strip_whitespace=True,
    )
    type: AssetType
    parent_id: str


class AssetUpdate(BaseModel):
    """DTO for updating an asset."""

    name: str | None = Field(
        None,
        min_length=ASSET_NAME_MIN_LENGTH,
        max_length=ASSET_NAME_MAX_LENGTH,
        strip_whitespace=True,
    )
    type: AssetType | None = None
    parent_id: str | None = None


class BuildingProfile(BaseModel):
    """Deployment-wide building profile (singleton).

    Standalone descriptive metadata, decoupled from the asset hierarchy.
    Every field is optional; unset fields are ``None``. ``icon`` is free text
    here — the supported set is enforced by the frontend form only.
    """

    name: str | None = None
    address: str | None = None
    surface: float | None = Field(None, ge=0)
    floors: int | None = Field(None, ge=0)
    year_built: int | None = None
    operator: str | None = None
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    cover_url: str | None = None
    icon: str | None = None


def get_asset_create_schema() -> dict:
    """JSON schema of AssetCreate for frontend form validation."""
    return AssetCreate.model_json_schema()


def get_building_profile_schema() -> dict:
    """JSON schema of BuildingProfile for the frontend form."""
    return BuildingProfile.model_json_schema()


__all__ = [
    "ASSET_NAME_MAX_LENGTH",
    "ASSET_NAME_MIN_LENGTH",
    "Asset",
    "AssetCreate",
    "AssetType",
    "AssetUpdate",
    "BuildingProfile",
    "get_asset_create_schema",
    "get_building_profile_schema",
]
