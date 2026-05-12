from datetime import datetime
from enum import StrEnum
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, computed_field, field_validator, model_validator

from models.errors import InvalidError
from models.types import DATA_TYPE_MAP, DataType
from timeseries.domain.time_range import parse_duration


class Interval(StrEnum):
    MIN_15 = "15min"
    H_1 = "1h"
    D_1 = "1d"
    MO_1 = "1mo"


class AggregationOperator(StrEnum):
    AVG = "avg"
    TW_AVG = "tw_avg"
    SUM = "sum"
    MIN = "min"
    MAX = "max"
    FIRST = "first"
    LAST = "last"
    MODE = "mode"
    TW_MODE = "tw_mode"
    COUNT = "count"


_IDENTITY: dict[DataType, DataType | None] = {dt: dt for dt in DataType}
_ALL_INT: dict[DataType, DataType | None] = dict.fromkeys(DataType, DataType.INT)
_AVG_ROW: dict[DataType, DataType | None] = {
    DataType.FLOAT: DataType.FLOAT,
    DataType.INT: DataType.FLOAT,
    DataType.BOOL: DataType.FLOAT,
    DataType.STRING: None,
}
_SUM_ROW: dict[DataType, DataType | None] = {
    DataType.FLOAT: DataType.FLOAT,
    DataType.INT: DataType.INT,
    DataType.BOOL: DataType.INT,
    DataType.STRING: None,
}

# (operator x data_type) -> output DataType; None marks invalid combinations
AGG_COMPAT: dict[AggregationOperator, dict[DataType, DataType | None]] = {
    AggregationOperator.COUNT: _ALL_INT,
    AggregationOperator.FIRST: _IDENTITY,
    AggregationOperator.LAST: _IDENTITY,
    AggregationOperator.MIN: _IDENTITY,
    AggregationOperator.MAX: _IDENTITY,
    AggregationOperator.SUM: _SUM_ROW,
    AggregationOperator.AVG: _AVG_ROW,
    AggregationOperator.TW_AVG: _AVG_ROW,
    AggregationOperator.MODE: _IDENTITY,
    AggregationOperator.TW_MODE: _IDENTITY,
}


def resolve_aggregation_data_type(
    agg: AggregationOperator, data_type: DataType
) -> DataType:
    """Return the output DataType for the given (operator, input data_type) pair.

    Raises InvalidError for combinations marked as invalid in the compatibility
    matrix, e.g. avg on str, or sum on str.
    """
    result = AGG_COMPAT[agg][data_type]
    if result is None:
        msg = f"Operator {agg!r} is not supported for data type {data_type!r}"
        raise InvalidError(msg)
    return result


class AggregatedPoint(BaseModel):
    interval_start: datetime
    # bool before int/float to prevent pydantic from coercing True/False to 1/1.0
    value: bool | int | float | str | None
    count: int


class AggregationQuery(BaseModel):
    interval: Interval
    agg: AggregationOperator
    start: datetime | None = None
    end: datetime | None = None
    last: str | None = None
    timezone: str | None = None

    @field_validator("last")
    @classmethod
    def _validate_last(cls, v: str | None) -> str | None:
        if v is None:
            return v
        try:
            parse_duration(v)
        except InvalidError as e:
            raise ValueError(str(e)) from e
        return v

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, KeyError):
            msg = f"Unknown IANA timezone: {v!r}"
            raise ValueError(msg) from None
        return v

    @model_validator(mode="after")
    def _validate_time_range(self) -> "AggregationQuery":
        if self.start is not None and self.end is not None and self.start >= self.end:
            msg = "start must be before end"
            raise ValueError(msg)
        return self


class AggregationResult(BaseModel):
    interval: Interval
    agg: AggregationOperator
    data_type: DataType
    timezone: str
    points: list[AggregatedPoint]

    @computed_field
    @property
    def aggregation_data_type(self) -> DataType:
        return resolve_aggregation_data_type(self.agg, self.data_type)

    @model_validator(mode="after")
    def _validate_point_value_types(self) -> "AggregationResult":
        expected_type = DATA_TYPE_MAP[self.aggregation_data_type]
        for point in self.points:
            if point.value is not None and not isinstance(point.value, expected_type):
                msg = (
                    f"Point value {point.value!r} does not match "
                    f"aggregation_data_type {self.aggregation_data_type!r}"
                )
                raise ValueError(msg)
        return self
