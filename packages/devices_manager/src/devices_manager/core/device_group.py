"""Explicit, homogeneous device groups, independent of zones and tags."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

GroupName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]


class DeviceGroupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: GroupName
    description: str = ""
    driver_id: str = Field(min_length=1)
    device_ids: list[str] = Field(default_factory=list)

    @field_validator("device_ids")
    @classmethod
    def unique_members(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))


class DeviceGroupUpdate(BaseModel):
    """Replace metadata and membership; the reference driver is immutable."""

    model_config = ConfigDict(extra="forbid")

    name: GroupName
    description: str = ""
    device_ids: list[str]

    @field_validator("device_ids")
    @classmethod
    def unique_members(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))


class DeviceGroup(DeviceGroupCreate):
    id: str
    created_at: datetime
    updated_at: datetime
