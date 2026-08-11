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


class Asset(ResourceMetadata):
    """Public asset model (API response)."""

    id: str
    parent_id: str | None = None
    type: AssetType
    name: str
    path: list[str] = Field(default_factory=list)
    position: int = 0
    ifc_global_id: str | None = None


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
    ifc_global_id: str | None = None


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


class BuildingModelStatus(StrEnum):
    """Lifecycle of an uploaded building model conversion."""

    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class ModelStorey(BaseModel):
    """A building storey extracted from an uploaded IFC model."""

    global_id: str
    name: str
    elevation: float | None = None


class ModelSpace(BaseModel):
    """A room/space extracted from an uploaded IFC model."""

    global_id: str
    name: str
    storey_global_id: str | None = None
    storey_name: str | None = None


class BuildingModel(ResourceMetadata):
    """Metadata of the 3D model attached to a building asset.

    The binary payloads (raw IFC, converted glTF scene) are stored alongside
    but never exposed through this model.
    """

    asset_id: str
    status: BuildingModelStatus
    filename: str
    ifc_size: int = 0
    glb_size: int | None = None
    error: str | None = None
    storeys: list[ModelStorey] = Field(default_factory=list)
    spaces: list[ModelSpace] = Field(default_factory=list)


class TreeImportResult(BaseModel):
    """Outcome of replacing the building subtree from the IFC model."""

    floors_created: int
    rooms_created: int


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
    "BuildingModel",
    "BuildingModelStatus",
    "BuildingProfile",
    "ModelSpace",
    "ModelStorey",
    "TreeImportResult",
    "get_asset_create_schema",
    "get_building_profile_schema",
]
