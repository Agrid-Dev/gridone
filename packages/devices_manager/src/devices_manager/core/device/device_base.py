from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from devices_manager.types import DeviceConfig


@dataclass
class DeviceBase:
    """Lightweight constructor struct for creating devices from stored data."""

    id: str
    name: str
    config: DeviceConfig
