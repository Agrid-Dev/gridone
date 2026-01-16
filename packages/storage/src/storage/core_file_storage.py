from pathlib import Path

from dto.device_dto import DeviceDTO
from dto.driver_dto import DriverDTO
from dto.transport_dto import TransportDTO
from dto.transport_dto import build_dto as build_transport_dto

from .yaml_file_storage import YamlFileStorage


class CoreFileStorage:
    """A basic file storage system for the core."""

    _root_dir: Path
    devices: YamlFileStorage[DeviceDTO]
    drivers: YamlFileStorage[DriverDTO]
    transports: YamlFileStorage[TransportDTO]

    def __init__(self, root_dir: str | Path) -> None:
        self._root_dir = Path(root_dir)
        self.devices = YamlFileStorage[DeviceDTO](
            self._root_dir / "devices", model_cls=DeviceDTO
        )
        self.drivers = YamlFileStorage[DriverDTO](
            self._root_dir / "drivers", model_cls=DriverDTO
        )

        def transport_dto_factory(data: dict) -> TransportDTO:
            return build_transport_dto(
                transport_id=data["id"],
                name=data.get("name", ""),
                protocol=data["protocol"],
                config=data.get("config", {}),
            )

        self.transports = YamlFileStorage[TransportDTO](
            self._root_dir / "transports", factory=transport_dto_factory
        )
