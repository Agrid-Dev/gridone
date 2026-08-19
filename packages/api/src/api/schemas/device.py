from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from devices_manager.dto.device_dto import Device
from devices_manager.types import AttributeValueType
from models.targets import AttributeCoverage


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


class AttributeCoverageResponse(BaseModel):
    """Response body for ``GET /devices/attributes``.

    ``total_devices`` is the size of the matched device set, so clients can
    render per-attribute coverage (``device_count`` / ``total_devices``).
    """

    total_devices: int
    attributes: list[AttributeCoverage]


class TagGroupResponse(BaseModel):
    label: str
    """The group's tag value, or :data:`api.targets.UNTAGGED_GROUP_LABEL` for
    devices without the key — a sentinel the UI translates, not display text."""

    device_count: int


class TagGroupsResponse(BaseModel):
    """Response body for ``GET /devices/tag-groups``.

    Previews how a device set splits by one tag key — the group-by editor's
    free-text fallback, ahead of a proper tag vocabulary.
    """

    total_devices: int
    groups: list[TagGroupResponse]


class DeviceBatchItem(BaseModel):
    # Unlike single-device creation, batch entries require a name: it is the
    # only way to tell otherwise-identical devices apart in the batch result.
    name: str = Field(min_length=1)
    config: dict


class DeviceBatchCreate(BaseModel):
    """Create many devices sharing one driver + transport, each with its own config."""

    driver_id: str
    transport_id: str
    devices: list[DeviceBatchItem] = Field(min_length=1)


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
