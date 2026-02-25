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


class DeviceAssetLink(BaseModel):
    """Represents a device-asset relationship."""

    device_id: str
    asset_id: str


def get_asset_create_schema() -> dict:
    """JSON schema of AssetCreate for frontend form validation."""
    return AssetCreate.model_json_schema()


__all__ = [
    "ASSET_NAME_MAX_LENGTH",
    "ASSET_NAME_MIN_LENGTH",
    "Asset",
    "AssetCreate",
    "AssetType",
    "AssetUpdate",
    "DeviceAssetLink",
    "get_asset_create_schema",
]
