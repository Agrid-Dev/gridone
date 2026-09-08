from __future__ import annotations

from datetime import datetime
from enum import StrEnum

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


class AssetAssignment(BaseModel):
    """One device moved into one zone, by resource id."""

    device_id: str = Field(min_length=1)
    asset_id: str = Field(min_length=1)


class AssetAssignmentRequest(BaseModel):
    """Body of ``POST /devices/asset-assignments``.

    Identical duplicates collapse to a single assignment; two rows sending the
    same device to different zones are contradictory and reject the whole
    request, since neither outcome can be the one the caller meant.
    """

    assignments: list[AssetAssignment] = Field(min_length=1)

    @model_validator(mode="after")
    def _collapse_duplicates(self) -> AssetAssignmentRequest:
        by_device: dict[str, str] = {}
        for assignment in self.assignments:
            previous = by_device.get(assignment.device_id)
            if previous is not None and previous != assignment.asset_id:
                msg = (
                    f"Device {assignment.device_id} is assigned to two "
                    f"different zones in the same request"
                )
                raise ValueError(msg)
            by_device[assignment.device_id] = assignment.asset_id
        self.assignments = [
            AssetAssignment(device_id=device_id, asset_id=asset_id)
            for device_id, asset_id in by_device.items()
        ]
        return self


class AssetAssignmentStatus(StrEnum):
    APPLIED = "applied"
    """The device now carries the requested zone; it did not before."""

    UNCHANGED = "unchanged"
    """The device already sat in the requested zone; nothing was written."""

    FAILED = "failed"
    """Nothing was written for this device; `error` says why."""


class AssetAssignmentResult(BaseModel):
    """Outcome of one assignment. Failures are per-device: the assignments that
    succeeded stay applied, and the caller can retry the ones that did not."""

    device_id: str
    asset_id: str
    status: AssetAssignmentStatus
    error: str | None = None


class AssetAssignmentResponse(BaseModel):
    results: list[AssetAssignmentResult]
