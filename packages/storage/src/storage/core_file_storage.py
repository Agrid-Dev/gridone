from pathlib import Path

from core.device import Device
from core.devices_manager import (
    DeviceRaw,
    DevicesManager,
)
from dto.driver_dto import DriverDTO
from dto.driver_dto import dto_to_core as driver_dto_to_core
from dto.transport_dto import TransportDTO
from dto.transport_dto import build_dto as build_transport_dto
from dto.transport_dto import dto_to_core as transport_dto_to_core

from .yaml_file_storage import YamlFileStorage


class CoreFileStorage:
    """A basic file storage system for the core."""

    _root_dir: Path
    devices: YamlFileStorage[DeviceRaw]
    drivers: YamlFileStorage[DriverDTO]
    transports: YamlFileStorage[TransportDTO]

    def __init__(self, root_dir: str | Path) -> None:
        self._root_dir = Path(root_dir)
        self.devices = YamlFileStorage[DeviceRaw](
            self._root_dir / "devices", model_cls=DeviceRaw
        )
        self.drivers = YamlFileStorage[DriverDTO](
            self._root_dir / "drivers", model_cls=DriverDTO
        )

        def transport_factory(data: dict) -> TransportDTO:
            return build_transport_dto(
                transport_id=data["id"],
                name=data.get("name", ""),
                protocol=data["protocol"],
                config=data.get("config", {}),
            )

        self.transports = YamlFileStorage[TransportDTO](
            self._root_dir / "transports", factory=transport_factory
        )

    def init_device_manager(self) -> DevicesManager:
        return DevicesManager.load_from_raw(
            devices_raw=self.devices.read_all(),
            drivers=[driver_dto_to_core(d) for d in self.drivers.read_all()],
            transports=[transport_dto_to_core(t) for t in self.transports.read_all()],
        )

    def load_device(self, device_id: str) -> Device:
        device_raw = self.devices.read(device_id)
        driver_dto = self.drivers.read(device_raw.driver)
        transport_dto = self.transports.read(device_raw.transport_id)
        return DevicesManager.build_device(
            device_raw,
            driver_dto_to_core(driver_dto),
            transport_dto_to_core(transport_dto),
        )
