from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, model_validator

from devices_manager.dto.device_dto import Device
from devices_manager.types import AttributeValueType


class TimeseriesPushPoint(BaseModel):
    attribute: str
    timestamp: datetime
    value: AttributeValueType


class TimeseriesBulkPushRequest(BaseModel):
    data: list[TimeseriesPushPoint]


class SingleAttrTimeseriesPushPoint(BaseModel):
    timestamp: datetime
    value: AttributeValueType


class TimeseriesSingleAttrPushRequest(BaseModel):
    data: list[SingleAttrTimeseriesPushPoint]


class TagValueBody(BaseModel):
    value: str


class DeviceBatchItemResult(BaseModel):
    """Outcome of one entry in a batch create: either the created device or an error."""

    device: Device | None = None
    error: str | None = None

    @model_validator(mode="after")
    def _check_exactly_one_set(self) -> DeviceBatchItemResult:
        if (self.device is None) == (self.error is None):
            msg = "Exactly one of `device` or `error` must be set"
            raise ValueError(msg)
        return self
