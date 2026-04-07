"""Abstract interfaces for DevicesManager consumed by the API layer."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    import builtins

    from .core.device import Attribute
    from .core.discovery_manager import DiscoveryConfig
    from .dto import (
        DeviceCreateDTO,
        DeviceDTO,
        DeviceUpdateDTO,
        DriverDTO,
        StandardAttributeSchemaDTO,
        TransportCreateDTO,
        TransportDTO,
        TransportUpdateDTO,
    )
    from .types import AttributeValueType


class DiscoveryManagerInterface(Protocol):
    """Protocol for discovery manager operations used by the API layer."""

    def has(self, driver_id: str, transport_id: str) -> bool: ...

    async def register(self, driver_id: str, transport_id: str) -> None: ...

    async def unregister(self, driver_id: str, transport_id: str) -> None: ...

    def list(
        self,
        *,
        driver_id: str | None = None,
        transport_id: str | None = None,
    ) -> builtins.list[DiscoveryConfig]: ...


class DevicesManagerInterface(Protocol):
    """Protocol that the API layer uses to interact with device management."""

    # -- properties --

    @property
    def transport_ids(self) -> set[str]: ...

    @property
    def driver_ids(self) -> set[str]: ...

    @property
    def device_ids(self) -> set[str]: ...

    @property
    def discovery_manager(self) -> DiscoveryManagerInterface: ...

    # -- devices --

    def list_devices(self, *, device_type: str | None = None) -> list[DeviceDTO]: ...

    def get_device(self, device_id: str) -> DeviceDTO: ...

    async def add_device(self, device_create: DeviceCreateDTO) -> DeviceDTO: ...

    async def update_device(
        self, device_id: str, device_update: DeviceUpdateDTO
    ) -> DeviceDTO: ...

    async def delete_device(self, device_id: str) -> None: ...

    async def read_device(self, device_id: str) -> DeviceDTO: ...

    async def write_device_attribute(
        self,
        device_id: str,
        attribute_name: str,
        value: AttributeValueType,
        *,
        confirm: bool = True,
    ) -> Attribute: ...

    # -- transports --

    def list_transports(self) -> list[TransportDTO]: ...

    def get_transport(self, transport_id: str) -> TransportDTO: ...

    async def add_transport(
        self, transport: TransportCreateDTO | TransportDTO
    ) -> TransportDTO: ...

    async def update_transport(
        self, transport_id: str, update: TransportUpdateDTO
    ) -> TransportDTO: ...

    async def delete_transport(self, transport_id: str) -> None: ...

    # -- drivers --

    def list_drivers(self, *, device_type: str | None = None) -> list[DriverDTO]: ...

    def get_driver(self, driver_id: str) -> DriverDTO: ...

    async def add_driver(self, driver_dto: DriverDTO) -> DriverDTO: ...

    async def delete_driver(self, driver_id: str) -> None: ...

    # -- standard schemas --

    def list_standard_schemas(self) -> list[StandardAttributeSchemaDTO]: ...


__all__ = ["DevicesManagerInterface", "DiscoveryManagerInterface"]
