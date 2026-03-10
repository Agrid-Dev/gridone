from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from secrets import token_hex

from models.errors import InvalidError
from models.types import AttributeValueType, DataType

DataPointValue = AttributeValueType


@dataclass(frozen=True)
class SeriesKey:
    owner_id: str
    metric: str


@dataclass(frozen=True)
class DataPoint[T: (int, float, bool, str)]:
    timestamp: datetime
    value: T
    command_id: int | None = None


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


class SortOrder(StrEnum):
    ASC = "asc"
    DESC = "desc"


class CommandStatus(StrEnum):
    SUCCESS = "success"
    ERROR = "error"


@dataclass
class DeviceCommandCreate[T: (int, float, bool, str)]:
    device_id: str
    attribute: str
    user_id: str
    value: T
    data_type: DataType
    status: CommandStatus
    timestamp: datetime
    status_details: str | None


@dataclass
class DeviceCommand[T: (int, float, bool, str)](DeviceCommandCreate[T]):
    id: int
