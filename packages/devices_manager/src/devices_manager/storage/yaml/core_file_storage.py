from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

from devices_manager.dto import DriverSpec
from devices_manager.dto.device_dto import Device
from devices_manager.storage.transport_record import (
    RecordTransportStorage,
    TransportRecord,
)

from .yaml_dm_storage import YamlDeviceStorage, YamlFileStorage

if TYPE_CHECKING:
    from devices_manager.core.device import Attribute
    from devices_manager.core.transports import TransportStorage
    from devices_manager.storage.storage_backend import (
        DeviceStorageBackend,
        StorageBackend,
    )

logger = logging.getLogger(__name__)


class CoreFileStorage:
    """A basic yaml file storage system satisfying ``DevicesManagerStorage``."""

    _root_dir: Path
    devices: DeviceStorageBackend
    drivers: StorageBackend[DriverSpec]
    transports: TransportStorage

    def __init__(self, root_dir: str | Path) -> None:
        self._root_dir = Path(root_dir)
        self.devices = YamlDeviceStorage(self._root_dir / "devices", model_cls=Device)
        self.drivers = YamlFileStorage[DriverSpec](
            self._root_dir / "drivers", model_cls=DriverSpec
        )
        self.transports = RecordTransportStorage(
            YamlFileStorage[TransportRecord](
                self._root_dir / "transports", model_cls=TransportRecord
            )
        )

    async def save_attribute(self, device_id: str, attribute: Attribute) -> None:
        """Persist attribute by rewriting the device file."""
        try:
            dto = await self.devices.read(device_id)
        except FileNotFoundError:
            logger.warning(
                "Cannot persist attribute for unknown device %s",
                device_id,
            )
            return
        dto.attributes[attribute.name] = attribute
        await self.devices.write(device_id, dto)

    async def close(self) -> None:
        pass
