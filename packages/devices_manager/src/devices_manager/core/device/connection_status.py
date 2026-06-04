from enum import StrEnum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .event_log import AttributeEventLog

CONNECTION_STATUS_ATTR = "connection_status"


class ConnectionStatus(StrEnum):
    IDLE = "idle"
    OK = "ok"
    DEGRADED = "degraded"
    ERROR = "error"


_STATUS_BY_OUTCOMES: dict[frozenset[str], ConnectionStatus] = {
    frozenset({"ok"}): ConnectionStatus.OK,
    frozenset({"error"}): ConnectionStatus.ERROR,
}


def compute_connection_status(entries: "list[AttributeEventLog]") -> ConnectionStatus:
    """Derive connection health from a flat list of event-log entries.

    Maps the set of distinct outcome statuses to a ConnectionStatus:
      {}          → idle  (no activity observed yet)
      {"ok"}      → ok
      {"error"}   → error
      {"ok","error"} → degraded
    """
    if not entries:
        return ConnectionStatus.IDLE
    return _STATUS_BY_OUTCOMES.get(
        frozenset(e.status for e in entries), ConnectionStatus.DEGRADED
    )
