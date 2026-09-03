from enum import StrEnum

from pydantic import BaseModel, Field

from models.metadata import ResourceMetadata

ASSET_NAME_MIN_LENGTH = 1
ASSET_NAME_MAX_LENGTH = 128


class AssetType(StrEnum):
    """Allowed asset hierarchy types."""

    ORG = "org"
    BUILDING = "building"
    FLOOR = "floor"
    ROOM = "room"
    ZONE = "zone"


class AssetUsage(StrEnum):
    """What a room or zone is used for.

    Orthogonal to the hierarchy ``type``: a ``room`` may be a hotel room or a
    technical closet. ``None`` on the asset means "not classified yet";
    ``OTHER`` means "deliberately none of the above".
    """

    HOTEL_ROOM = "hotel_room"
    COMMON_AREA = "common_area"
    RESTAURANT = "restaurant"
    TECHNICAL_ZONE = "technical_zone"
    OFFICE = "office"
    MEETING_ROOM = "meeting_room"
    OPEN_SPACE = "open_space"
    OTHER = "other"


USAGE_CAPABLE_TYPES: frozenset[AssetType] = frozenset({AssetType.ROOM, AssetType.ZONE})
"""Hierarchy levels that may carry a usage."""


class Asset(ResourceMetadata):
    """Public asset model (API response)."""

    id: str
    parent_id: str | None = None
    type: AssetType
    name: str
    path: list[str] = Field(default_factory=list)
    position: int = 0
    usage: AssetUsage | None = None


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
    usage: AssetUsage | None = None


class AssetUpdate(BaseModel):
    """DTO for updating an asset.

    Omitted fields keep their stored value. ``usage`` is the one field where an
    explicit ``null`` differs from omission: it clears the classification.
    """

    name: str | None = Field(
        None,
        min_length=ASSET_NAME_MIN_LENGTH,
        max_length=ASSET_NAME_MAX_LENGTH,
        strip_whitespace=True,
    )
    type: AssetType | None = None
    parent_id: str | None = None
    usage: AssetUsage | None = None


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
    "USAGE_CAPABLE_TYPES",
    "Asset",
    "AssetCreate",
    "AssetType",
    "AssetUpdate",
    "AssetUsage",
    "BuildingProfile",
    "get_asset_create_schema",
    "get_building_profile_schema",
]
