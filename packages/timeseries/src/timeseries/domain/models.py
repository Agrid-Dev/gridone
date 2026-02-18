from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from secrets import token_hex
from typing import TypeVar

from timeseries.errors import InvalidError

T = TypeVar("T", int, float, bool, str)
DataPointValue = int | float | bool | str


class DataType(StrEnum):
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    STRING = "string"


DATA_TYPE_MAP: dict[DataType, type] = {
    DataType.INTEGER: int,
    DataType.FLOAT: float,
    DataType.BOOLEAN: bool,
    DataType.STRING: str,
}

VALUE_TYPE_MAP: dict[type, DataType] = {v: k for k, v in DATA_TYPE_MAP.items()}


@dataclass(frozen=True)
class SeriesKey:
    owner_id: str
    metric: str


@dataclass(frozen=True)
class DataPoint[T: (int, float, bool, str)]:
    timestamp: datetime
    value: T


@dataclass
class TimeSeries[T: (int, float, bool, str)]:
    data_type: DataType
    owner_id: str
    metric: str
    id: str = field(default_factory=lambda: token_hex(8))
    created_at: datetime = field(default_factory=lambda: datetime.now(tz=UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(tz=UTC))
    data_points: list[DataPoint[T]] = field(default_factory=list)

    @property
    def key(self) -> SeriesKey:
        return SeriesKey(
            owner_id=self.owner_id,
            metric=self.metric,
        )


def validate_value_type(value: DataPointValue, expected: type) -> None:

    if type(value) is not expected:
        msg = f"Expected {expected.__name__}, got {type(value).__name__}"
        raise InvalidError(msg)
