from typing import Protocol

from pydantic import BaseModel

from devices_manager.dto import DeviceDTO, DriverDTO, TransportDTO


class StorageBackend[M: BaseModel](Protocol):
    async def read(self, id: str) -> M: ...

    async def write(self, id: str, data: M) -> None: ...

    async def read_all(self) -> list[M]: ...

    async def list_all(self) -> list[str]: ...

    async def delete(self, id: str) -> None: ...


class DevicesManagerStorage(Protocol):
    devices: StorageBackend[DeviceDTO]
    drivers: StorageBackend[DriverDTO]
    transports: StorageBackend[TransportDTO]


__all__ = ["StorageBackend", "DevicesManagerStorage"]
