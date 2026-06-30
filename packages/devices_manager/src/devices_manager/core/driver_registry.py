from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel

from devices_manager.core.driver.driver_metadata import DriverMetadata
from devices_manager.dto import (
    DriverPatch,
    DriverSpec,
    driver_from_public,
    driver_to_public,
)
from devices_manager.storage.memory import MemoryStorageBackend
from models.errors import NotFoundError

if TYPE_CHECKING:
    from devices_manager.core.transports import TransportClient
    from devices_manager.storage import StorageBackend

    from .driver import Driver


class DriverRegistry:
    """In-memory registry for drivers with optional persistence."""

    _drivers: dict[str, Driver]
    _storage: StorageBackend[DriverSpec]

    def __init__(
        self,
        drivers: dict[str, Driver] | None = None,
        *,
        storage: StorageBackend[DriverSpec] | None = None,
    ) -> None:
        self._drivers = drivers if drivers is not None else {}
        self._storage = (
            storage if storage is not None else MemoryStorageBackend[DriverSpec]()
        )

    def set_storage(self, storage: StorageBackend[DriverSpec]) -> None:
        """Swap the persistence backend after construction."""
        self._storage = storage

    @property
    def all(self) -> dict[str, Driver]:
        return self._drivers

    @property
    def ids(self) -> set[str]:
        return set(self._drivers.keys())

    def list_all(self, *, device_type: str | None = None) -> list[DriverSpec]:
        drivers = self._drivers.values()
        if device_type is not None:
            drivers = [d for d in drivers if d.type == device_type]
        return [driver_to_public(driver) for driver in drivers]

    def _get_or_raise(self, driver_id: str) -> Driver:
        try:
            return self._drivers[driver_id]
        except KeyError as e:
            msg = f"Driver {driver_id} not found"
            raise NotFoundError(msg) from e

    def get(self, driver_id: str) -> Driver:
        return self._get_or_raise(driver_id)

    def get_dto(self, driver_id: str) -> DriverSpec:
        driver = self._get_or_raise(driver_id)
        return driver_to_public(driver)

    async def add(self, driver_dto: DriverSpec) -> DriverSpec:
        if driver_dto.id in self._drivers:
            msg = f"Driver {driver_dto.id} already exists"
            raise ValueError(msg)
        driver = driver_from_public(driver_dto)
        self._drivers[driver_dto.id] = driver
        dto = driver_to_public(driver)
        await self._storage.write(dto.id, dto)
        return dto

    async def patch(self, driver_id: str, patch: DriverPatch) -> DriverSpec:
        driver = self._get_or_raise(driver_id)
        metadata_fields = DriverMetadata.model_fields
        for field in patch.model_fields_set:
            value = getattr(patch, field)
            if isinstance(value, BaseModel):
                value = getattr(driver, field).model_copy(
                    update=value.model_dump(exclude_unset=True)
                )
            target = driver.metadata if field in metadata_fields else driver
            setattr(target, field, value)
        dto = driver_to_public(driver)
        await self._storage.write(dto.id, dto)
        return dto

    async def remove(self, driver_id: str) -> None:
        self._get_or_raise(driver_id)
        del self._drivers[driver_id]
        await self._storage.delete(driver_id)

    @staticmethod
    def check_transport_compat(driver: Driver, transport: TransportClient) -> None:
        if driver.transport != transport.protocol:
            msg = f"Transport {transport.id} is not compatible with driver {driver.id}"
            raise ValueError(msg)
