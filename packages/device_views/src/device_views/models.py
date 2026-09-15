from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from models.tags import Tag
from models.targets import DevicesFilter


class DeviceViewInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    filter: DevicesFilter = Field(default_factory=DevicesFilter)
    group_by: list[Tag]

    @model_validator(mode="after")
    def validate_configuration(self) -> "DeviceViewInput":
        if len(set(self.group_by)) != len(self.group_by):
            msg = "Grouping keys must be unique"
            raise ValueError(msg)
        if self.filter.ids is not None:
            msg = "Views use criteria; assign tags to save a device selection"
            raise ValueError(msg)
        return self


class DeviceView(DeviceViewInput):
    id: str
    created_at: datetime
    updated_at: datetime
