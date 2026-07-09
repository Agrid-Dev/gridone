from datetime import UTC, datetime
from typing import TYPE_CHECKING, Final

from devices_manager.types import ConnectionStatus, DataType

from .attribute import Attribute, AttributeKind

if TYPE_CHECKING:
    from .device import AttributeTimestamps
    from .event_log import AttributeEventLog

CONNECTION_STATUS_ATTR: Final = "connection_status"
SILENCE_DEGRADED_MULTIPLIER: Final = 2
SILENCE_ERROR_MULTIPLIER: Final = 3

_STATUS_BY_OUTCOMES: dict[str, ConnectionStatus] = {
    "ok": ConnectionStatus.OK,
    "error": ConnectionStatus.ERROR,
}


def build_cs_attribute(
    initial_value: str | None,
    *,
    restored: "AttributeTimestamps | None" = None,
) -> Attribute:
    now = datetime.now(UTC) if initial_value is not None else None
    last_updated = restored.last_updated if restored is not None else now
    last_changed = restored.last_changed if restored is not None else now
    return Attribute(
        name=CONNECTION_STATUS_ATTR,
        kind=AttributeKind.INTERNAL,
        data_type=DataType.STRING,
        read_write_modes={"read"},
        current_value=initial_value or ConnectionStatus.IDLE,
        last_updated=last_updated,
        last_changed=last_changed,
        value_options=list(ConnectionStatus),
    )


def compute_connection_status(entries: "list[AttributeEventLog]") -> ConnectionStatus:
    """Derive connection health from a flat list of event-log entries.

    Maps the set of distinct outcome statuses to a ConnectionStatus:
      {}          → idle  (no activity observed yet)
      {"ok"}      → ok
      {"error"}   → error
      {"ok","error"} → degraded
    """
    statuses = frozenset(e.status for e in entries)
    if not statuses:
        return ConnectionStatus.IDLE
    if len(statuses) > 1:
        return ConnectionStatus.DEGRADED
    return _STATUS_BY_OUTCOMES[next(iter(statuses))]
