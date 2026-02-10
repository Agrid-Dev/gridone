from dataclasses import dataclass

from devices_manager.types import DeviceConfig


@dataclass
class DeviceBase:
    id: str
    name: str
    config: DeviceConfig
