from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from pydantic import BaseModel

if TYPE_CHECKING:
    from devices_manager.core.device import Attribute
    from devices_manager.dto import DeviceDTO, DriverDTO, TransportDTO


class StorageBackend[M: BaseModel](Protocol):
    async def read(self, item_id: str) -> M: ...

    async def write(self, item_id: str, data: M) -> None: ...

    async def read_all(self) -> list[M]: ...

    async def list_all(self) -> list[str]: ...

    async def delete(self, item_id: str) -> None: ...


class DevicesManagerStorage(Protocol):
    devices: StorageBackend[DeviceDTO]
    drivers: StorageBackend[DriverDTO]
    transports: StorageBackend[TransportDTO]

    async def save_attribute(self, device_id: str, attribute: Attribute) -> None: ...

    async def close(self) -> None: ...


__all__ = [
    "DevicesManagerStorage",
    "StorageBackend",
]
