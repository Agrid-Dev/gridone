from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime  # noqa: TC003
from enum import StrEnum
from typing import Any

from models.types import AttributeValueType, DataType  # noqa: TC001


class CommandStatus(StrEnum):
    PENDING = "pending"
    SUCCESS = "success"
    ERROR = "error"


@dataclass
class WriteResult:
    """Minimal result returned by DeviceWriter, decoupled from devices_manager."""

    last_changed: datetime | None


# ---------------------------------------------------------------------------
# Target
# ---------------------------------------------------------------------------
# A ``Target`` is an opaque description of a device set. The commands package
# never inspects its keys — the composition-root :class:`TargetResolver`
# interprets it (today by forwarding to ``devices_manager.list_devices``).
# The HTTP layer validates the shape with pydantic before it reaches the
# service, so unknown keys land as 422 at the boundary.
Target = Mapping[str, Any]


@dataclass
class UnitCommandCreate:
    batch_id: str | None
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
class BatchCommand:
    """Summary of a batch dispatch — one write fanned out across many devices.

    Derived from the unit commands produced by ``dispatch_batch``. Target
    persistence is deferred to the ``command_templates`` table in a later
    step, so this DTO intentionally does not carry the target.
    """

    batch_id: str
    attribute: str
    value: AttributeValueType
    data_type: DataType
    device_ids: list[str]
    created_at: datetime
    created_by: str

    @classmethod
    def from_unit_commands(cls, commands: list[UnitCommand]) -> BatchCommand:
        if not commands:
            msg = "cannot build BatchCommand from empty command list"
            raise ValueError(msg)
        first = commands[0]
        if first.batch_id is None:
            msg = "unit commands must carry a batch_id"
            raise ValueError(msg)
        return cls(
            batch_id=first.batch_id,
            attribute=first.attribute,
            value=first.value,
            data_type=first.data_type,
            device_ids=[c.device_id for c in commands],
            created_at=first.created_at,
            created_by=first.user_id,
        )
