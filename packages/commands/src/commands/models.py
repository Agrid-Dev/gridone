from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime  # noqa: TC003
from enum import StrEnum

from models.types import AttributeValueType, DataType  # noqa: TC001


@dataclass
class DevicesFilter:
    ids: list[str] | None = None
    types: list[str] | None = None
    writable_attribute: str | None = None
    writable_attribute_type: DataType | None = None
    tags: dict[str, list[str]] | None = None


class CommandStatus(StrEnum):
    PENDING = "pending"
    SUCCESS = "success"
    ERROR = "error"


@dataclass
class WriteResult:
    """Minimal result returned by DeviceWriter, decoupled from devices_manager."""

    last_changed: datetime | None


@dataclass
class CommandCreate:
    group_id: str | None
    device_id: str
    attribute: str
    value: AttributeValueType
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
