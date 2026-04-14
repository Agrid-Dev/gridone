from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime  # noqa: TC003
from enum import StrEnum

from models.types import AttributeValueType, DataType

DataPointValue = AttributeValueType


class CommandStatus(StrEnum):
    PENDING = "pending"
    SUCCESS = "success"
    ERROR = "error"


class SortOrder(StrEnum):
    ASC = "asc"
    DESC = "desc"


@dataclass
class WriteResult:
    """Minimal result returned by DeviceWriter, decoupled from devices_manager."""

    last_changed: datetime | None


@dataclass
class CommandCreate:
    group_id: str | None
    device_id: str
    attribute: str
    value: DataPointValue
    data_type: DataType
    status: CommandStatus
    status_details: str | None
    user_id: str
    created_at: datetime
    executed_at: datetime | None
    completed_at: datetime | None


@dataclass
class Command(CommandCreate):
    id: int
