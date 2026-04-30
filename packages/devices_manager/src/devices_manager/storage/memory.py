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

from devices_manager.dto import Device, DriverSpec, Transport

if TYPE_CHECKING:
    from devices_manager.core.device import Attribute

    from .storage_backend import DeviceStorageBackend, StorageBackend


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


class MemoryDeviceStorage(MemoryStorageBackend[Device]):
    """``DeviceStorageBackend`` extension with targeted tag mutations.

    Tag mutations are no-ops when the target device has not yet been
    persisted, matching the postgres backend's "no row, no row to update"
    semantics on a missing primary key (which would otherwise be a noisy
    FK violation in the path of in-memory-only test setups).
    """

    async def set_tag(self, device_id: str, key: str, value: str) -> None:
        device = self._items.get(device_id)
        if device is None:
            return
        device.tags[key] = value

    async def delete_tag(self, device_id: str, key: str) -> None:
        device = self._items.get(device_id)
        if device is None:
            return
        device.tags.pop(key, None)


class MemoryDevicesStorage:
    """Composite in-memory storage satisfying ``DevicesManagerStorage``."""

    devices: DeviceStorageBackend
    drivers: StorageBackend[DriverSpec]
    transports: StorageBackend[Transport]

    def __init__(self) -> None:
        self.devices = MemoryDeviceStorage()
        self.drivers = MemoryStorageBackend[DriverSpec]()
        self.transports = MemoryStorageBackend[Transport]()

    async def save_attribute(self, device_id: str, attribute: Attribute) -> None:
        try:
            device = await self.devices.read(device_id)
        except FileNotFoundError:
            return
        device.attributes[attribute.name] = attribute
        await self.devices.write(device_id, device)

    async def close(self) -> None:
        pass
