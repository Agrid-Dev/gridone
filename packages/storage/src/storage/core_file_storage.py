from pathlib import Path

from core.device import Device
from core.devices_manager import (
    DeviceRaw,
    DevicesManager,
    DriverRaw,
    TransportConfigRaw,
)

from .yaml_file_storage import YamlFileStorage


class CoreFileStorage:
    """A basic file storage system for the core."""

    _root_dir: Path
    drivers: YamlFileStorage[DriverRaw]
    devices: YamlFileStorage[DeviceRaw]
    transport_configs: YamlFileStorage[TransportConfigRaw]

    def __init__(self, root_dir: str | Path) -> None:
        self._root_dir = Path(root_dir)
        self.drivers = YamlFileStorage[DriverRaw](self._root_dir / "drivers")
        self.devices = YamlFileStorage[DeviceRaw](self._root_dir / "devices")
        self.transport_configs = YamlFileStorage[TransportConfigRaw](
            self._root_dir / "transport_configs"
        )

    async def init_device_manager(self) -> DevicesManager:
        return await DevicesManager.load_from_raw(
            devices_raw=self.devices.read_all(),
            drivers_raw=self.drivers.read_all(),
            transport_configs=self.transport_configs.read_all(),
        )

    def load_device(self, device_id: str) -> Device:
        device_raw = self.devices.read(device_id)
        driver_raw = self.drivers.read(device_raw["driver"])
        transport_config = (
            self.transport_configs.read(device_raw["transport_config"])
            if device_raw.get("transport_config")
            else None
        )
        return DevicesManager.build_device(device_raw, driver_raw, transport_config)
