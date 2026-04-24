"""Abstract interfaces for DevicesManager consumed by the API layer."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Protocol

from .core.device import Attribute, CoreDevice

AttributeListener = Callable[[CoreDevice, str, Attribute], Awaitable[None] | None]

if TYPE_CHECKING:
    import builtins
    from collections.abc import Iterable

    from models.types import Severity

    from .core.discovery_manager import DiscoveryConfig
    from .dto import (
        Device,
        DeviceCreate,
        DeviceUpdate,
        DriverSpec,
        FaultView,
        StandardAttributeSchema,
        Transport,
        TransportCreate,
        TransportUpdate,
    )
    from .types import AttributeValueType, DataType


class DeviceRegistryInterface(Protocol):
    """Protocol for device registry operations used by DevicesManager."""

    @property
    def all(self) -> dict[str, CoreDevice]: ...

    @property
    def ids(self) -> set[str]: ...

    def get(self, device_id: str) -> CoreDevice: ...

    def get_dto(self, device_id: str) -> Device: ...

    def list_all(  # noqa: PLR0913
        self,
        *,
        ids: Iterable[str] | None = None,
        types: list[str] | None = None,
        writable_attribute: str | None = None,
        writable_attribute_type: DataType | None = None,
        tags: dict[str, list[str]] | None = None,
        is_faulty: bool | None = None,
    ) -> list[Device]: ...

    async def register(self, device: CoreDevice) -> None: ...

    async def add(self, device_create: DeviceCreate) -> CoreDevice: ...

    async def update(
        self, device_id: str, device_update: DeviceUpdate
    ) -> CoreDevice: ...

    async def remove(self, device_id: str) -> None: ...

    async def set_tag(self, device_id: str, key: str, value: str) -> CoreDevice: ...

    async def delete_tag(self, device_id: str, key: str) -> CoreDevice: ...

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

    def list_devices(  # noqa: PLR0913
        self,
        *,
        ids: Iterable[str] | None = None,
        types: list[str] | None = None,
        writable_attribute: str | None = None,
        writable_attribute_type: DataType | None = None,
        tags: dict[str, list[str]] | None = None,
        is_faulty: bool | None = None,
    ) -> list[Device]: ...

    def get_device(self, device_id: str) -> Device: ...

    async def add_device(self, device_create: DeviceCreate) -> Device: ...

    async def update_device(
        self, device_id: str, device_update: DeviceUpdate
    ) -> Device: ...

    async def delete_device(self, device_id: str) -> None: ...

    async def set_device_tag(self, device_id: str, key: str, value: str) -> Device: ...

    async def delete_device_tag(self, device_id: str, key: str) -> Device: ...

    async def read_device(self, device_id: str) -> Device: ...

    async def write_device_attribute(
        self,
        device_id: str,
        attribute_name: str,
        value: AttributeValueType,
        *,
        confirm: bool = True,
    ) -> Attribute: ...

    # -- faults --

    def list_active_faults(
        self,
        *,
        severity: Severity | None = None,
        device_id: str | None = None,
    ) -> list[FaultView]: ...

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

    # -- attribute listeners --

    def add_device_attribute_listener(self, callback: AttributeListener) -> str: ...

    def remove_device_attribute_listener(self, listener_id: str) -> None: ...


__all__ = [
    "DeviceRegistryInterface",
    "DevicesManagerInterface",
    "DiscoveryManagerInterface",
]
