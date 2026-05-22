from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    PositiveInt,
    computed_field,
    field_validator,
    model_serializer,
    model_validator,
)

from models.errors import InvalidError
from models.types import DATA_TYPE_MAP, DataType
from timeseries.domain.time_range import (
    parse_duration,
    parse_duration_parts,
    resolve_last,
    validate_tz_name,
)


class IntervalUnit(StrEnum):
    MIN = "min"
    H = "h"
    D = "d"
    MO = "mo"


# "m" is the minutes alias accepted by parse_duration_parts (same grammar as `last`).
_SUFFIX_TO_UNIT: dict[str, IntervalUnit] = {
    "min": IntervalUnit.MIN,
    "m": IntervalUnit.MIN,
    "h": IntervalUnit.H,
    "d": IntervalUnit.D,
    "mo": IntervalUnit.MO,
}


def _parse_interval_str(raw: str) -> dict[str, Any]:
    """Parse ``"Nunit"`` → ``{"qty": N, "unit": unit}``; e.g. ``"15min"``."""
    msg = "expected Nunit where unit is min/h/d/mo and N ≥ 1"
    try:
        qty, suffix = parse_duration_parts(raw)
    except InvalidError:
        raise ValueError(msg) from None
    unit = _SUFFIX_TO_UNIT.get(suffix)
    if unit is None:
        raise ValueError(msg)
    return {"qty": qty, "unit": unit}


class Interval(BaseModel):
    model_config = ConfigDict(frozen=True)
    qty: PositiveInt
    unit: IntervalUnit

    @model_validator(mode="before")
    @classmethod
    def _from_str(cls, v: object) -> object:
        if isinstance(v, str):
            return _parse_interval_str(v)
        return v

    @model_validator(mode="after")
    def _validate_mo(self) -> "Interval":
        if self.unit == IntervalUnit.MO and self.qty != 1:
            msg = "Only 1mo is supported; multi-month intervals are not allowed"
            raise ValueError(msg)
        return self

    @model_serializer
    def _to_str(self) -> str:
        return f"{self.qty}{self.unit}"

    def __str__(self) -> str:
        return f"{self.qty}{self.unit}"

    def to_timedelta(self) -> timedelta:
        """Return the interval as a timedelta (MO approximated as 30 days)."""
        match self.unit:
            case IntervalUnit.MIN:
                return timedelta(minutes=self.qty)
            case IntervalUnit.H:
                return timedelta(hours=self.qty)
            case IntervalUnit.D:
                return timedelta(days=self.qty)
            case IntervalUnit.MO:
                return timedelta(days=30 * self.qty)


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
        msg = f"Operator '{agg}' is not supported for data type '{data_type}'"
        raise InvalidError(msg)
    return result


class AggregatedPoint(BaseModel):
    interval_start: datetime
    # bool before int/float to prevent pydantic from coercing True/False to 1/1.0
    value: bool | int | float | str | None
    count: int


class AggregationQuery(BaseModel):
    interval: Interval | Literal["auto"] = "auto"
    agg: AggregationOperator
    start: datetime | None = None
    end: datetime | None = None
    last: str | None = None
    timezone: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _resolve_time_range(cls, data: object) -> object:
        """Resolve last→start and start→end=now before field validation runs.

        Pops ``last`` (consumed here, not stored), resolves it to a ``start``
        timestamp if no explicit ``start`` is provided, then fills ``end`` with
        the current UTC time when ``start`` is set but ``end`` is absent.
        """
        if not isinstance(data, dict):
            return data
        d: dict[str, Any] = data  # type: ignore[assignment]
        now = datetime.now(UTC)
        last = d.pop("last", None)
        if last is not None:
            try:
                parse_duration(last)
            except InvalidError as e:
                raise ValueError(str(e)) from e
            if not d.get("start"):
                d["start"] = resolve_last(last, now=now)
        if d.get("start") and not d.get("end"):
            d["end"] = now
        return d

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        validate_tz_name(v)
        return v

    @model_validator(mode="after")
    def _validate_time_range(self) -> "AggregationQuery":
        s, e = self.start, self.end
        # Skip comparison when mixing naive and aware — service normalizes both
        if (
            s is not None
            and e is not None
            and (s.tzinfo is None) == (e.tzinfo is None)
            and s >= e
        ):
            msg = "start must be before end"
            raise ValueError(msg)
        return self


class AggregationResult(BaseModel):
    interval: Interval | Literal["raw"]
    agg: AggregationOperator
    data_type: DataType
    timezone: str
    points: list[AggregatedPoint]
    truncated: bool = False

    @computed_field
    @property
    def aggregation_data_type(self) -> DataType:
        if self.interval == "raw":
            return self.data_type
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
