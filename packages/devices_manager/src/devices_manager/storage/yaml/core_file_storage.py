from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

from devices_manager.storage.device_record import DeviceRecord, RecordDeviceStorage
from devices_manager.storage.driver_record import DriverRecord, RecordDriverStorage
from devices_manager.storage.transport_record import (
    RecordTransportStorage,
    TransportRecord,
)

from .yaml_dm_storage import YamlFileStorage

if TYPE_CHECKING:
    from devices_manager.core.device import Attribute, DeviceStorage
    from devices_manager.core.driver import DriverStorage
    from devices_manager.core.transports import TransportStorage

logger = logging.getLogger(__name__)


class CoreFileStorage:
    """A basic yaml file storage system satisfying ``DevicesManagerStorage``."""

    _root_dir: Path
    devices: DeviceStorage
    drivers: DriverStorage
    transports: TransportStorage

    def __init__(self, root_dir: str | Path) -> None:
        self._root_dir = Path(root_dir)
        self._device_storage = RecordDeviceStorage(
            YamlFileStorage[DeviceRecord](
                self._root_dir / "devices", model_cls=DeviceRecord
            )
        )
        self.devices = self._device_storage
        self.drivers = RecordDriverStorage(
            YamlFileStorage[DriverRecord](
                self._root_dir / "drivers", model_cls=DriverRecord
            )
        )
        self.transports = RecordTransportStorage(
            YamlFileStorage[TransportRecord](
                self._root_dir / "transports", model_cls=TransportRecord
            )
        )

    async def save_attribute(self, device_id: str, attribute: Attribute) -> None:
        """Persist attribute by rewriting the device file."""
        if not await self._device_storage.save_attribute(device_id, attribute):
            logger.warning(
                "Cannot persist attribute for unknown device %s",
                device_id,
            )

    async def close(self) -> None:
        pass
