"""Connection monitoring: attribute outcomes and push silence, folded into a
device's connection status."""

from .events import AttributeLogs, EventType
from .monitor import (
    SILENCE_DEGRADED_MULTIPLIER,
    SILENCE_ERROR_MULTIPLIER,
    ConnectionMonitor,
)

__all__ = [
    "SILENCE_DEGRADED_MULTIPLIER",
    "SILENCE_ERROR_MULTIPLIER",
    "AttributeLogs",
    "ConnectionMonitor",
    "EventType",
]
