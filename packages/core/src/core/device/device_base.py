from dataclasses import dataclass

from core.types import DeviceConfig


@dataclass
class DeviceBase:
    id: str
    name: str
    config: DeviceConfig
