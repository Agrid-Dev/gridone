"""HTTP tag payloads and the temporary single-zone compatibility adapter."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from api.devices_filter import ASSET_TAG
from api.schemas.command import DevicesFilterBody
from devices_manager.dto import Device
from models.errors import InvalidError
from models.tags import Tag, normalize_tag


class BulkTagRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target: DevicesFilterBody
    operation: Literal["add", "remove"]
    key: Tag
    values: list[Tag] = Field(min_length=1)


class RenameTagRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: Tag
    old_value: Tag
    new_value: Tag


class TagFacetValue(BaseModel):
    value: str
    device_count: int


class TagFacet(BaseModel):
    key: str
    values: list[TagFacetValue]


def tag_facets(devices: list[Device]) -> list[TagFacet]:
    counts: dict[str, dict[str, set[str]]] = {}
    for device in devices:
        for key, values in device.tags.items():
            for value in values:
                counts.setdefault(key, {}).setdefault(value, set()).add(device.id)
    return [
        TagFacet(
            key=key,
            values=[
                TagFacetValue(value=value, device_count=len(ids))
                for value, ids in sorted(values.items())
            ],
        )
        for key, values in sorted(counts.items())
    ]


def validate_zone_values(key: str, values: list[str]) -> None:
    if normalize_tag(key) == ASSET_TAG and len(set(values)) > 1:
        msg = (
            "A device can belong to only one zone; "
            "use other tags for multiple memberships"
        )
        raise InvalidError(msg)
