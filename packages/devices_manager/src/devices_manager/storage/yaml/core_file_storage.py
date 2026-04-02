from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

from devices_manager.dto.device_dto import DeviceDTO
from devices_manager.dto.driver_dto import DriverDTO
from devices_manager.dto.transport_dto import (
    TransportDTO,
)
from devices_manager.dto.transport_dto import (
    build_dto as build_transport_dto,
)
from devices_manager.storage.storage_backend import (
    AttributeStorageBackend,
    DevicesManagerStorage,
)

from .yaml_dm_storage import YamlFileStorage

if TYPE_CHECKING:
    from devices_manager.core.device import Attribute

logger = logging.getLogger(__name__)


class YamlAttributeStorage(AttributeStorageBackend):
    """Persists a single attribute by rewriting the device YAML file."""

    def __init__(self, devices: YamlFileStorage[DeviceDTO]) -> None:
        self._devices = devices

    async def save_attribute(self, device_id: str, attribute: Attribute) -> None:
        try:
            dto = await self._devices.read(device_id)
        except FileNotFoundError:
            logger.warning(
                "Cannot persist attribute for unknown device %s",
                device_id,
            )
            return
        dto.attributes[attribute.name] = attribute
        await self._devices.write(device_id, dto)


class CoreFileStorage(DevicesManagerStorage):
    """A basic file storage system for the core."""

    _root_dir: Path
    devices: YamlFileStorage[DeviceDTO]
    drivers: YamlFileStorage[DriverDTO]
    transports: YamlFileStorage[TransportDTO]
    attributes: YamlAttributeStorage

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
        self.attributes = YamlAttributeStorage(self.devices)

    async def close(self) -> None:
        pass
