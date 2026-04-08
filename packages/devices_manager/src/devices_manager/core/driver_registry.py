from __future__ import annotations

from typing import TYPE_CHECKING

from devices_manager.dto import DriverDTO, driver_core_to_dto, driver_dto_to_core
from models.errors import NotFoundError

if TYPE_CHECKING:
    from devices_manager.core.transports import TransportClient

    from .driver import Driver


class DriverRegistry:
    """Pure in-memory registry for drivers."""

    _drivers: dict[str, Driver]

    def __init__(self, drivers: dict[str, Driver] | None = None) -> None:
        self._drivers = drivers if drivers is not None else {}

    @property
    def all(self) -> dict[str, Driver]:
        return self._drivers

    @property
    def ids(self) -> set[str]:
        return set(self._drivers.keys())

    def list(self, *, device_type: str | None = None) -> list[DriverDTO]:
        drivers = self._drivers.values()
        if device_type is not None:
            drivers = [d for d in drivers if d.type == device_type]
        return [driver_core_to_dto(driver) for driver in drivers]

    def _get_or_raise(self, driver_id: str) -> Driver:
        try:
            return self._drivers[driver_id]
        except KeyError as e:
            msg = f"Driver {driver_id} not found"
            raise NotFoundError(msg) from e

    def get(self, driver_id: str) -> Driver:
        return self._get_or_raise(driver_id)

    def get_dto(self, driver_id: str) -> DriverDTO:
        driver = self._get_or_raise(driver_id)
        return driver_core_to_dto(driver)

    def add(self, driver_dto: DriverDTO) -> DriverDTO:
        if driver_dto.id in self._drivers:
            msg = f"Driver {driver_dto.id} already exists"
            raise ValueError(msg)
        driver = driver_dto_to_core(driver_dto)
        self._drivers[driver_dto.id] = driver
        return driver_core_to_dto(driver)

    def remove(self, driver_id: str) -> None:
        self._get_or_raise(driver_id)
        del self._drivers[driver_id]

    @staticmethod
    def check_transport_compat(driver: Driver, transport: TransportClient) -> None:
        if driver.transport != transport.protocol:
            msg = f"Transport {transport.id} is not compatible with driver {driver.id}"
            raise ValueError(msg)
