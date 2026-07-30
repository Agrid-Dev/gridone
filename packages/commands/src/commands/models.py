from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime  # noqa: TC003
from enum import StrEnum

from pydantic import BaseModel, ConfigDict

from models.targets import DevicesFilter  # noqa: TC001
from models.types import AttributeValueType, DataType  # noqa: TC001


class CommandStatus(StrEnum):
    PENDING = "pending"
    SUCCESS = "success"
    ERROR = "error"


@dataclass
class WriteResult:
    """Minimal result returned by DeviceWriter, decoupled from devices_manager."""

    last_changed: datetime | None


@dataclass
class AttributeWrite:
    """The ``what`` of a command: an attribute to set on a device."""

    attribute: str
    value: AttributeValueType
    data_type: DataType


@dataclass
class CommandTemplateCreate:
    """Inputs for creating a :class:`CommandTemplate`.

    ``name`` is the saved-vs-ephemeral signal: a non-null name marks the
    template as user-saved (shows up in the templates list); ``None`` marks
    an ephemeral template auto-created by :meth:`CommandsService.dispatch_batch`
    so the target survives for audit.
    """

    target: DevicesFilter
    write: AttributeWrite
    name: str | None


@dataclass
class CommandTemplate(CommandTemplateCreate):
    id: str
    created_at: datetime
    created_by: str


class CommandTemplatePatch(BaseModel):
    """Partial update for a :class:`CommandTemplate`.

    Pydantic's ``model_fields_set`` lets the service tell ``name=None``
    (demote to ephemeral) apart from name omitted (keep as-is) — using
    ``dict.get`` would erase that distinction.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    target: DevicesFilter | None = None
    write: AttributeWrite | None = None
    name: str | None = None


@dataclass
class UnitCommandCreate:
    batch_id: str | None
    template_id: str | None
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
class UnitCommand(UnitCommandCreate):
    id: int


@dataclass
class BatchCommandDispatch:
    """Result of a batch dispatch: the shared ``batch_id`` and the unit
    commands it stamped.

    Returned by :meth:`CommandsService.dispatch_batch` and
    :meth:`CommandsService.dispatch_from_template`. ``commands`` is empty
    when the target resolved to no devices; callers (HTTP, automations)
    branch on emptiness — the ``batch_id`` is still generated so the
    dispatch attempt is observable.
    """

    batch_id: str
    commands: list[UnitCommand]
