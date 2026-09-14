"""Connection monitoring: attribute outcomes and push silence, folded into a
device's connection status."""

from .events import AttributeLogs, EventType
from .monitor import (
    SILENCE_ERROR_MULTIPLIER,
    SILENCE_UNSTABLE_MULTIPLIER,
    ConnectionMonitor,
)

__all__ = [
    "SILENCE_ERROR_MULTIPLIER",
    "SILENCE_UNSTABLE_MULTIPLIER",
    "AttributeLogs",
    "ConnectionMonitor",
    "EventType",
]
