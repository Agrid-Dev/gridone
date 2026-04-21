from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from pydantic import BaseModel

from devices_manager.dto import Device

if TYPE_CHECKING:
    from devices_manager.core.device import Attribute
    from devices_manager.dto import DriverSpec, Transport


class StorageBackend[M: BaseModel](Protocol):
    async def read(self, item_id: str) -> M: ...

    async def write(self, item_id: str, data: M) -> None: ...

    async def read_all(self) -> list[M]: ...

    async def list_all(self) -> list[str]: ...

    async def delete(self, item_id: str) -> None: ...


class DeviceStorageBackend(StorageBackend[Device], Protocol):
    """StorageBackend[Device] extended with targeted tag-mutation methods."""

    async def set_tag(self, device_id: str, key: str, value: str) -> None: ...

    async def delete_tag(self, device_id: str, key: str) -> None: ...


class DevicesManagerStorage(Protocol):
    devices: DeviceStorageBackend
    drivers: StorageBackend[DriverSpec]
    transports: StorageBackend[Transport]

    async def save_attribute(self, device_id: str, attribute: Attribute) -> None: ...

    async def close(self) -> None: ...


__all__ = [
    "DeviceStorageBackend",
    "DevicesManagerStorage",
    "StorageBackend",
]
