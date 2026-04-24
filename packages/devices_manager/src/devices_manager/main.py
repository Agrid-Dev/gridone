from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from models.errors import ForbiddenError

from .core.device import (
    Attribute,
    CoreDevice,
    FaultAttribute,
)
from .core.device_registry import DeviceRegistry
from .core.discovery_manager import (
    DiscoveryContext,
    PhysicalDevicesDiscoveryManager,
)
from .core.driver_registry import DriverRegistry
from .core.standard_schemas.registry import default_registry
from .core.transport_registry import TransportRegistry
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
    device_from_public,
    device_to_public,
    standard_schema_to_public,
    transport_to_public,
)
from .storage.factory import build_storage

if TYPE_CHECKING:
    from collections.abc import Iterable

    from models.types import Severity

    from .core.driver import Driver
    from .core.transports import TransportClient
    from .interface import AttributeListener
    from .storage import DevicesManagerStorage
    from .types import AttributeValueType, DataType

logger = logging.getLogger(__name__)


def _fault_view_from(device: CoreDevice, attr: FaultAttribute) -> FaultView:
    # Invariants: callers only pass FaultAttributes where is_faulty is True
    # (=> current_value is not None), and the FaultAttribute model validator
    # guarantees timestamps whenever current_value is set.
    assert attr.current_value is not None  # noqa: S101
    assert attr.last_updated is not None  # noqa: S101
    assert attr.last_changed is not None  # noqa: S101
    return FaultView(
        device_id=device.id,
        device_name=device.name,
        attribute_name=attr.name,
        severity=attr.severity,
        current_value=attr.current_value,
        last_updated=attr.last_updated,
        last_changed=attr.last_changed,
    )


class DevicesManager:
    _device_registry: DeviceRegistry
    _transport_registry: TransportRegistry
    _driver_registry: DriverRegistry
    _discovery_manager: PhysicalDevicesDiscoveryManager
    _running: bool
    _attribute_update_handlers: dict[str, AttributeListener]
    _background_tasks: set[asyncio.Task[Any]]
    _storage: DevicesManagerStorage | None

    def __init__(
        self,
        devices: dict[str, CoreDevice],
        drivers: dict[str, Driver],
        transports: dict[str, TransportClient],
        *,
        storage: DevicesManagerStorage | None = None,
    ) -> None:
        self._storage = storage
        self._running = False
        self._attribute_update_handlers = {}
        self._background_tasks = set()
        self._transport_registry = TransportRegistry(
            transports,
            storage=storage.transports if storage else None,
        )
        self._driver_registry = DriverRegistry(
            drivers,
            storage=storage.drivers if storage else None,
        )
        self._device_registry = DeviceRegistry(
            devices,
            resolve_driver=self._driver_registry.get,
            resolve_transport=self._transport_registry.get,
            on_attribute_update=self._on_attribute_update,
            storage=storage.devices if storage else None,
        )

    # -- Sync lifecycle --

    async def start_sync(self) -> None:
        """Start synchronizing all devices."""
        self._running = True
        for device in self._device_registry.all.values():
            await device.start_sync()

    async def stop_sync(self) -> None:
        """Stop synchronizing all devices."""
        for device in self._device_registry.all.values():
            await device.stop_sync()
        self._running = False

    # -- Devices (delegated to DeviceRegistry) --

    @property
    def device_ids(self) -> set[str]:
        return self._device_registry.ids

    def list_devices(  # noqa: PLR0913
        self,
        *,
        ids: Iterable[str] | None = None,
        types: list[str] | None = None,
        writable_attribute: str | None = None,
        writable_attribute_type: DataType | None = None,
        tags: dict[str, list[str]] | None = None,
        is_faulty: bool | None = None,
    ) -> list[Device]:
        return self._device_registry.list_all(
            ids=ids,
            types=types,
            writable_attribute=writable_attribute,
            writable_attribute_type=writable_attribute_type,
            tags=tags,
            is_faulty=is_faulty,
        )

    def get_device(self, device_id: str) -> Device:
        return self._device_registry.get_dto(device_id)

    async def add_device(self, device_create: DeviceCreate) -> Device:
        device = await self._device_registry.add(device_create)
        if self._running:
            await device.start_sync()
        return device_to_public(device)

    async def update_device(
        self, device_id: str, device_update: DeviceUpdate
    ) -> Device:
        old_device = self._device_registry.get(device_id)
        await old_device.stop_sync()
        device = await self._device_registry.update(device_id, device_update)
        if self._running:
            await device.start_sync()
        return device_to_public(device)

    async def delete_device(self, device_id: str) -> None:
        device = self._device_registry.get(device_id)
        await device.stop_sync()
        await self._device_registry.remove(device_id)

    async def set_device_tag(self, device_id: str, key: str, value: str) -> Device:
        device = await self._device_registry.set_tag(device_id, key, value)
        return device_to_public(device)

    async def delete_device_tag(self, device_id: str, key: str) -> Device:
        device = await self._device_registry.delete_tag(device_id, key)
        return device_to_public(device)

    async def read_device(self, device_id: str) -> Device:
        device = self._device_registry.get(device_id)
        if not self._running:
            await device.update_once()
        return device_to_public(device)

    async def write_device_attribute(
        self,
        device_id: str,
        attribute_name: str,
        value: AttributeValueType,
        *,
        confirm: bool = True,
    ) -> Attribute:
        return await self._device_registry.write_attribute(
            device_id, attribute_name, value, confirm=confirm
        )

    # -- Faults --

    def list_active_faults(
        self,
        *,
        severity: Severity | None = None,
        device_id: str | None = None,
    ) -> list[FaultView]:
        devices = self._resolve_fault_scope(device_id)
        faults = self._collect_active_faults(devices, severity=severity)
        faults.sort(key=lambda f: f.last_updated, reverse=True)
        return faults

    def _resolve_fault_scope(self, device_id: str | None) -> list[CoreDevice]:
        if device_id is not None:
            return [self._device_registry.get(device_id)]
        return list(self._device_registry.all.values())

    @staticmethod
    def _collect_active_faults(
        devices: list[CoreDevice],
        *,
        severity: Severity | None,
    ) -> list[FaultView]:
        return [
            _fault_view_from(device, attr)
            for device in devices
            for attr in device.attributes.values()
            if isinstance(attr, FaultAttribute)
            and attr.is_faulty
            and (severity is None or attr.severity == severity)
        ]

    # -- Attribute listeners --

    def _on_attribute_update(
        self, device: CoreDevice, attribute_name: str, attribute: Attribute
    ) -> None:
        """Dispatch attribute update to all registered handlers."""
        for handler in self._attribute_update_handlers.values():
            try:
                result = handler(device, attribute_name, attribute)
                if asyncio.iscoroutine(result):
                    task = asyncio.create_task(result)
                    self._background_tasks.add(task)
                    task.add_done_callback(self._on_handler_task_done)
            except Exception:
                logger.exception(
                    "Attribute update handler failed for %s.%s",
                    device.id,
                    attribute_name,
                )

    def _on_handler_task_done(self, task: asyncio.Task[Any]) -> None:
        self._background_tasks.discard(task)
        if not task.cancelled() and (exc := task.exception()):
            logger.error("Async attribute update handler failed", exc_info=exc)

    def add_device_attribute_listener(self, callback: AttributeListener) -> str:
        """Register a handler for attribute updates. Returns an opaque listener ID."""
        listener_id = uuid4().hex[:16]
        self._attribute_update_handlers[listener_id] = callback
        return listener_id

    def remove_device_attribute_listener(self, listener_id: str) -> None:
        """Unregister a previously registered attribute update handler."""
        self._attribute_update_handlers.pop(listener_id, None)

    # -- Discovery --

    async def _register_and_persist_device(self, device: CoreDevice) -> None:
        """Register device and persist to storage. Used by discovery."""
        await self._device_registry.register(device)

    @property
    def discovery_manager(self) -> PhysicalDevicesDiscoveryManager:
        if not hasattr(self, "_discovery_manager"):
            discovery_context = DiscoveryContext(
                get_driver=lambda driver_id: self._driver_registry.all[driver_id],
                get_transport=lambda transport_id: self._transport_registry.all[
                    transport_id
                ],
                add_device=self._register_and_persist_device,
                device_exists=lambda device: any(
                    d == device for d in self._device_registry.all.values()
                ),
            )
            self._discovery_manager = PhysicalDevicesDiscoveryManager(
                context=discovery_context
            )
        return self._discovery_manager

    # -- Bootstrap --

    async def _restore_device(self, d: Device) -> None:
        logger.info("Adding device %s", d.id)
        try:
            device = device_from_public(
                d,
                self._driver_registry.all,
                self._transport_registry.all,
                on_update=self._on_attribute_update,
            )
            await self._device_registry.register(device)
        except KeyError:
            logger.exception(
                "Cannot create device %s: missing driver or transport", d.id
            )
        except Exception:
            logger.exception("Failed to init device %s", d.id)

    @classmethod
    async def _populate(
        cls,
        dm: DevicesManager,
        devices: list[Device],
        drivers: list[DriverSpec],
        transports: list[Transport],
    ) -> None:
        """Populate registries from DTOs during bootstrap."""
        for t in transports:
            try:
                await dm._transport_registry.add(t)
            except Exception:
                logger.exception("Failed to init transport %s", t.id)
        for d in drivers:
            try:
                await dm._driver_registry.add(d)
            except Exception:
                logger.exception("Failed to init driver %s", d.id)
        for d in devices:
            await dm._restore_device(d)

    @classmethod
    async def from_dto(
        cls,
        devices: list[Device],
        drivers: list[DriverSpec],
        transports: list[Transport],
    ) -> DevicesManager:
        dm = cls(devices={}, drivers={}, transports={})
        await cls._populate(dm, devices, drivers, transports)
        return dm

    @classmethod
    async def from_storage(cls, url: str) -> DevicesManager:
        repository = await build_storage(url)
        dm = cls(devices={}, drivers={}, transports={}, storage=repository)
        await cls._populate(
            dm,
            devices=await repository.devices.read_all(),
            drivers=await repository.drivers.read_all(),
            transports=await repository.transports.read_all(),
        )
        dm._register_attribute_persistence_listener()
        return dm

    def _register_attribute_persistence_listener(self) -> None:
        """Register a listener that persists attribute values on change.

        The listener is async and fire-and-forget: it does not block
        the polling or write hot path.
        """
        if not self._storage:
            return

        storage = self._storage

        async def _persist_attribute(
            device: CoreDevice,
            _attribute_name: str,
            attribute: Attribute,
        ) -> None:
            await storage.save_attribute(device.id, attribute)

        self.add_device_attribute_listener(_persist_attribute)

    # -- Transports (delegated to TransportRegistry) --

    @property
    def transport_ids(self) -> set[str]:
        return self._transport_registry.ids

    def list_transports(self) -> list[Transport]:
        return self._transport_registry.list_all()

    def get_transport(self, transport_id: str) -> Transport:
        return self._transport_registry.get_dto(transport_id)

    async def add_transport(self, transport: TransportCreate | Transport) -> Transport:
        return await self._transport_registry.add(transport)

    def _assert_transport_not_used(self, transport_id: str) -> None:
        device = next(
            (
                d
                for d in self._device_registry.all.values()
                if d.transport_id == transport_id
            ),
            None,
        )
        if device is not None:
            msg = f"Transport {transport_id} is used by device {device.id}"
            raise ForbiddenError(msg)

    async def delete_transport(self, transport_id: str) -> None:
        self._transport_registry.get(transport_id)
        self._assert_transport_not_used(transport_id)
        transport = await self._transport_registry.remove(transport_id)
        await transport.close()

    async def update_transport(
        self, transport_id: str, update: TransportUpdate
    ) -> Transport:
        transport = await self._transport_registry.update(transport_id, update)
        if update.config is not None:
            for device in self._device_registry.all.values():
                if device.transport_id == transport_id:
                    await device.stop_sync()
                    if self._running:
                        await device.start_sync()
        return transport_to_public(transport)

    # -- Drivers (delegated to DriverRegistry) --

    @property
    def driver_ids(self) -> set[str]:
        return self._driver_registry.ids

    def list_drivers(self, *, device_type: str | None = None) -> list[DriverSpec]:
        return self._driver_registry.list_all(device_type=device_type)

    @staticmethod
    def list_standard_schemas() -> list[StandardAttributeSchema]:
        return [
            standard_schema_to_public(schema) for schema in default_registry.values()
        ]

    def get_driver(self, driver_id: str) -> DriverSpec:
        return self._driver_registry.get_dto(driver_id)

    async def add_driver(self, driver_dto: DriverSpec) -> DriverSpec:
        return await self._driver_registry.add(driver_dto)

    def _assert_driver_not_used(self, driver_id: str) -> None:
        device = next(
            (d for d in self._device_registry.all.values() if d.driver_id == driver_id),
            None,
        )
        if device is not None:
            msg = f"Driver {driver_id} is used by device {device.id}"
            raise ForbiddenError(msg)

    async def delete_driver(self, driver_id: str) -> None:
        self._driver_registry.get(driver_id)
        self._assert_driver_not_used(driver_id)
        await self._driver_registry.remove(driver_id)

    async def stop(self) -> None:
        await self.stop_sync()
        await asyncio.gather(
            *(t.close() for t in self._transport_registry.all.values())
        )
        if self._storage:
            await self._storage.close()
