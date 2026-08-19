from datetime import datetime

from pydantic import BaseModel

from models.types import AttributeValueType, DataType
from timeseries.domain import AggregationOperator


class TimeSeriesResponse(BaseModel):
    id: str
    data_type: DataType
    owner_id: str
    metric: str
    created_at: datetime
    updated_at: datetime


class DataPointResponse(BaseModel):
    timestamp: datetime
    value: AttributeValueType
    command_id: int | None = None


class FetchPointsResultResponse(BaseModel):
    points: list[DataPointResponse]
    truncated: bool
    next_start: datetime | None = None


class AggregatedPointResponse(BaseModel):
    interval_start: datetime
    value: bool | int | float | str | None
    count: int


class AggregationResultResponse(BaseModel):
    interval: str
    agg: AggregationOperator
    data_type: DataType
    aggregation_data_type: DataType
    timezone: str
    truncated: bool
    points: list[AggregatedPointResponse]


class IntervalOption(BaseModel):
    interval: str
    bucket_count: int | None


class AggregateOptionsResponse(BaseModel):
    intervals: list[IntervalOption]
    recommended_interval: str | None
    operators_by_data_type: dict[DataType, dict[AggregationOperator, DataType | None]]
    """Every operator against every data type, mapped to the type it yields.

    ``None`` marks a pair the aggregation refuses, stated rather than omitted:
    an editor can then offer the whole vocabulary and disable what does not
    apply, instead of silently shortening its list.
    """
    space_operators_by_data_type: dict[
        DataType, dict[AggregationOperator, DataType | None]
    ]
    """Same shape as ``operators_by_data_type``, restricted to operators that
    can fold a device set (the space aggregation vocabulary)."""


class LiveSpaceAggregateResponse(BaseModel):
    """One attribute's current values across a device set, folded to one."""

    value: bool | int | float | str | None
    data_type: DataType
    space_agg: AggregationOperator
    device_count: int
    """How many of the target's devices had a current value to contribute."""


class LiveAggregateGroupResponse(BaseModel):
    label: str
    value: bool | int | float | str | None
    device_count: int
    """How many of the group's devices had a current value to contribute."""


class GroupedLiveAggregateResponse(BaseModel):
    """Group-by counterpart of :class:`LiveSpaceAggregateResponse`."""

    data_type: DataType
    space_agg: AggregationOperator
    groups: list[LiveAggregateGroupResponse]
