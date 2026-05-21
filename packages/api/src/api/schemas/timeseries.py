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


class AutoIntervalLookupEntry(BaseModel):
    max_period: str | None
    interval: str | None


class AggregateOptionsResponse(BaseModel):
    intervals: list[IntervalOption]
    recommended_interval: str | None
    operators_by_data_type: dict[str, list[str]]
    auto_interval_lookup: list[AutoIntervalLookupEntry]
