"""In-memory storage backend for devices_manager.

Used when the service is started with ``storage_url=None`` — typically tests
and ephemeral runs. Mirrors the semantics of the postgres backend (raises
``FileNotFoundError`` for missing items so the existing storage protocol
contracts hold).
"""

from __future__ import annotations

from copy import deepcopy
from typing import TYPE_CHECKING

from pydantic import BaseModel

from .device_record import DeviceRecord, RecordDeviceStorage
from .driver_record import DriverRecord, RecordDriverStorage
from .transport_record import RecordTransportStorage, TransportRecord

if TYPE_CHECKING:
    from devices_manager.core.device import Attribute, DeviceStorage
    from devices_manager.core.driver import DriverStorage
    from devices_manager.core.transports import TransportStorage


class MemoryStorageBackend[M: BaseModel]:
    """In-memory ``StorageBackend[M]`` implementation."""

    def __init__(self) -> None:
        self._items: dict[str, M] = {}

    async def read(self, item_id: str) -> M:
        try:
            return deepcopy(self._items[item_id])
        except KeyError as exc:
            msg = f"Storage entry '{item_id}' not found"
            raise FileNotFoundError(msg) from exc

    async def write(self, item_id: str, data: M) -> None:
        self._items[item_id] = deepcopy(data)

    async def read_all(self) -> list[M]:
        return [deepcopy(item) for item in self._items.values()]

    async def list_all(self) -> list[str]:
        return list(self._items)

    async def delete(self, item_id: str) -> None:
        # Tolerate missing items: registries that hold an entity in memory
        # without having persisted it (e.g. construction-time injection in
        # unit tests) still need a clean removal path.
        self._items.pop(item_id, None)


class MemoryDevicesStorage:
    """Composite in-memory storage satisfying ``DevicesManagerStorage``."""

    devices: DeviceStorage
    drivers: DriverStorage
    transports: TransportStorage

    def __init__(self) -> None:
        self._device_storage = RecordDeviceStorage(MemoryStorageBackend[DeviceRecord]())
        self.devices = self._device_storage
        self.drivers = RecordDriverStorage(MemoryStorageBackend[DriverRecord]())
        self.transports = RecordTransportStorage(
            MemoryStorageBackend[TransportRecord]()
        )

    async def save_attribute(self, device_id: str, attribute: Attribute) -> None:
        await self._device_storage.save_attribute(device_id, attribute)

    async def close(self) -> None:
        pass
