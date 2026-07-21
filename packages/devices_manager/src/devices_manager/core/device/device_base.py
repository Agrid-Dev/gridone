from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from devices_manager.types import DeviceConfig


@dataclass
class DeviceBase:
    """Lightweight constructor struct for creating devices from stored data."""

    id: str
    name: str
    config: DeviceConfig
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))
