from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from devices_manager.types import DeviceConfig

    from .attribute import Attribute


@dataclass
class DeviceBase:
    """Detached snapshot of a device: everything but the live collaborators.

    Carries the driver and transport as plain ids so a device can be stored
    and restored without them; :meth:`CoreDevice.from_base` assembles the
    live device once both are resolved.
    """

    id: str
    name: str
    config: DeviceConfig
    driver_id: str = ""
    transport_id: str = ""
    tags: dict[str, str] = field(default_factory=dict)
    attributes: dict[str, Attribute] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))
