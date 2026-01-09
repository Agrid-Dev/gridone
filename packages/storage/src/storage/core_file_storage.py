from pathlib import Path

from core.device import Device
from core.devices_manager import (
    DeviceRaw,
    DevicesManager,
    DriverRaw,
    TransportRaw,
)

from .yaml_file_storage import YamlFileStorage


class CoreFileStorage:
    """A basic file storage system for the core."""

    _root_dir: Path
    drivers: YamlFileStorage[DriverRaw]
    devices: YamlFileStorage[DeviceRaw]
    transports: YamlFileStorage[TransportRaw]

    def __init__(self, root_dir: str | Path) -> None:
        self._root_dir = Path(root_dir)
        self.drivers = YamlFileStorage[DriverRaw](self._root_dir / "drivers")
        self.devices = YamlFileStorage[DeviceRaw](self._root_dir / "devices")
        self.transports = YamlFileStorage[TransportRaw](self._root_dir / "transports")

    def init_device_manager(self) -> DevicesManager:
        return DevicesManager.load_from_raw(
            devices_raw=self.devices.read_all(),
            drivers_raw=self.drivers.read_all(),
            transports=self.transports.read_all(),
        )

    def load_device(self, device_id: str) -> Device:
        device_raw = self.devices.read(device_id)
        driver_raw = self.drivers.read(device_raw["driver"])
        transport = self.transports.read(device_raw["transport_id"])
        return DevicesManager.build_device(device_raw, driver_raw, transport)
