"""Abstract interfaces for DevicesManager consumed by the API layer."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    import builtins

    from .core.device import Attribute, CoreDevice
    from .core.discovery_manager import DiscoveryConfig
    from .dto import (
        Device,
        DeviceCreate,
        DeviceUpdate,
        DriverSpec,
        StandardAttributeSchema,
        Transport,
        TransportCreate,
        TransportUpdate,
    )
    from .types import AttributeValueType


class DeviceRegistryInterface(Protocol):
    """Protocol for device registry operations used by DevicesManager."""

    @property
    def all(self) -> dict[str, CoreDevice]: ...

    @property
    def ids(self) -> set[str]: ...

    def get(self, device_id: str) -> CoreDevice: ...

    def get_dto(self, device_id: str) -> Device: ...

    def list_all(self, *, device_type: str | None = None) -> list[Device]: ...

    def filter_compatible(
        self,
        device_ids: list[str],
        attribute: str,
        *,
        device_type: str | None = None,
    ) -> list[str]: ...

    async def register(self, device: CoreDevice) -> None: ...

    async def add(self, device_create: DeviceCreate) -> CoreDevice: ...

    async def update(
        self, device_id: str, device_update: DeviceUpdate
    ) -> CoreDevice: ...

    async def remove(self, device_id: str) -> None: ...

    async def write_attribute(
        self,
        device_id: str,
        attribute_name: str,
        value: AttributeValueType,
        *,
        confirm: bool = True,
    ) -> Attribute: ...


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

    def list_devices(self, *, device_type: str | None = None) -> list[Device]: ...

    def filter_compatible(
        self,
        device_ids: list[str],
        attribute: str,
        *,
        device_type: str | None = None,
    ) -> list[str]: ...

    def get_device(self, device_id: str) -> Device: ...

    async def add_device(self, device_create: DeviceCreate) -> Device: ...

    async def update_device(
        self, device_id: str, device_update: DeviceUpdate
    ) -> Device: ...

    async def delete_device(self, device_id: str) -> None: ...

    async def read_device(self, device_id: str) -> Device: ...

    async def write_device_attribute(
        self,
        device_id: str,
        attribute_name: str,
        value: AttributeValueType,
        *,
        confirm: bool = True,
    ) -> Attribute: ...

    # -- transports --

    def list_transports(self) -> list[Transport]: ...

    def get_transport(self, transport_id: str) -> Transport: ...

    async def add_transport(
        self, transport: TransportCreate | Transport
    ) -> Transport: ...

    async def update_transport(
        self, transport_id: str, update: TransportUpdate
    ) -> Transport: ...

    async def delete_transport(self, transport_id: str) -> None: ...

    # -- drivers --

    def list_drivers(self, *, device_type: str | None = None) -> list[DriverSpec]: ...

    def get_driver(self, driver_id: str) -> DriverSpec: ...

    async def add_driver(self, driver_dto: DriverSpec) -> DriverSpec: ...

    async def delete_driver(self, driver_id: str) -> None: ...

    # -- standard schemas --

    def list_standard_schemas(self) -> list[StandardAttributeSchema]: ...


__all__ = [
    "DeviceRegistryInterface",
    "DevicesManagerInterface",
    "DiscoveryManagerInterface",
]
