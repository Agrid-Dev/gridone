from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Coroutine
from typing import TYPE_CHECKING, Any

from models.errors import ForbiddenError

from .core.device import (
    Attribute,
    Device,
    PhysicalDevice,
)
from .core.device_registry import DeviceRegistry
from .core.discovery_manager import (
    DiscoveryContext,
    PhysicalDevicesDiscoveryManager,
)
from .core.driver_registry import DriverRegistry
from .core.standard_schemas.registry import default_registry
from .core.tasks_registry import TasksRegistry
from .core.transport_registry import TransportRegistry
from .dto import (
    DeviceCreateDTO,
    DeviceDTO,
    DeviceUpdateDTO,
    DriverDTO,
    StandardAttributeSchemaDTO,
    TransportCreateDTO,
    TransportDTO,
    TransportUpdateDTO,
    device_core_to_dto,
    device_dto_to_core,
    standard_schema_core_to_dto,
    transport_core_to_dto,
)
from .storage.factory import build_storage

if TYPE_CHECKING:
    from .core.driver import Driver
    from .core.transports import TransportClient
    from .interface import DeviceRegistryInterface
    from .storage import DevicesManagerStorage
    from .types import AttributeValueType

logger = logging.getLogger(__name__)

AttributeListener = Callable[[Device, str, Attribute], Coroutine[Any, Any, None] | None]


class DevicesManager:
    _device_registry: DeviceRegistryInterface
    _transport_registry: TransportRegistry
    _driver_registry: DriverRegistry
    _polling_tasks: TasksRegistry
    _discovery_manager: PhysicalDevicesDiscoveryManager
    _running: bool
    _attribute_update_handlers: list[AttributeListener]
    _background_tasks: set[asyncio.Task[None]]
    _storage: DevicesManagerStorage | None

    def __init__(
        self,
        devices: dict[str, Device],
        drivers: dict[str, Driver],
        transports: dict[str, TransportClient],
    ) -> None:
        self._transport_registry = TransportRegistry(transports)
        self._driver_registry = DriverRegistry(drivers)
        self._storage = None
        self._polling_tasks = TasksRegistry()
        self._running = False
        self._attribute_update_handlers = []
        self._background_tasks = set()
        self._device_registry = DeviceRegistry(
            devices,
            driver_registry=self._driver_registry,
            transport_registry=self._transport_registry,
            on_attribute_update=self._on_attribute_update,
        )

    async def start_polling(self) -> None:
        self._running = True
        for device in self._device_registry.all.values():
            await device.init_listeners()
            if device.polling_enabled:
                logger.info("Starting polling job for device %s", device.id)
                self._polling_tasks.add(
                    ("poll", device.id), self._device_poll_loop(device)
                )

    async def stop_polling(self) -> None:
        self._running = False
        await self._polling_tasks.shutdown()

    async def _device_poll_loop(self, device: Device) -> None:
        poll_interval = device.poll_interval
        if poll_interval is None:
            return
        try:
            while self._running:
                await device.update_attributes()
                await asyncio.sleep(poll_interval)
        except asyncio.CancelledError:
            return

    async def _restart_device_polling(self, device: Device) -> None:
        polling_key = ("poll", device.id)
        if self._polling_tasks.has(polling_key):
            await self._polling_tasks.remove(polling_key)
        if self._running and device.polling_enabled:
            self._polling_tasks.add(polling_key, self._device_poll_loop(device))

    async def _start_device_lifecycle(self, device: Device) -> None:
        """Start listeners and polling for a device if manager is running."""
        if self._running:
            await device.init_listeners()
            if device.polling_enabled:
                logger.info("Starting polling job for device %s", device.id)
                self._polling_tasks.add(
                    ("poll", device.id), self._device_poll_loop(device)
                )

    # -- Devices (delegated to DeviceRegistry) --

    @property
    def device_ids(self) -> set[str]:
        return self._device_registry.ids

    def list_devices(self, *, device_type: str | None = None) -> list[DeviceDTO]:
        return self._device_registry.list_all(device_type=device_type)

    def get_device(self, device_id: str) -> DeviceDTO:
        return self._device_registry.get_dto(device_id)

    async def add_device(self, device_create: DeviceCreateDTO) -> DeviceDTO:
        device = self._device_registry.add(device_create)
        await self._start_device_lifecycle(device)
        dto = device_core_to_dto(device)
        if self._storage:
            await self._storage.devices.write(dto.id, dto)
        return dto

    async def update_device(
        self, device_id: str, device_update: DeviceUpdateDTO
    ) -> DeviceDTO:
        old_device = self._device_registry.get(device_id)
        was_physical = isinstance(old_device, PhysicalDevice)

        device = self._device_registry.update(device_id, device_update)

        if isinstance(device, PhysicalDevice):
            if was_physical and device is not old_device:
                await device.init_listeners()
            await self._restart_device_polling(device)

        dto = device_core_to_dto(device)
        if self._storage:
            await self._storage.devices.write(device_id, dto)
        return dto

    async def delete_device(self, device_id: str) -> None:
        polling_key = ("poll", device_id)
        if self._polling_tasks.has(polling_key):
            await self._polling_tasks.remove(polling_key)
        self._device_registry.remove(device_id)
        if self._storage:
            await self._storage.devices.delete(device_id)

    async def read_device(self, device_id: str) -> DeviceDTO:
        device = self._device_registry.get(device_id)
        if not self._running:
            await device.update_once()
        return device_core_to_dto(device)

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

    # -- Attribute listeners --

    def _on_attribute_update(
        self, device: Device, attribute_name: str, attribute: Attribute
    ) -> None:
        """Dispatch attribute update to all registered handlers."""
        for handler in self._attribute_update_handlers:
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

    def _on_handler_task_done(self, task: asyncio.Task[None]) -> None:
        self._background_tasks.discard(task)
        if not task.cancelled() and (exc := task.exception()):
            logger.error("Async attribute update handler failed", exc_info=exc)

    def add_device_attribute_listener(
        self,
        callback: AttributeListener,
    ) -> None:
        """Register a handler for attribute updates on all devices."""
        self._attribute_update_handlers.append(callback)

    @property
    def poll_count(self) -> int:
        return len(self._polling_tasks)

    # -- Discovery --

    async def _register_and_persist_device(self, device: Device) -> None:
        """Register device and persist to storage. Used by discovery."""
        self._device_registry.register(device)
        if self._storage:
            dto = device_core_to_dto(device)
            await self._storage.devices.write(dto.id, dto)

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

    async def _restore_device(self, d: DeviceDTO) -> None:
        logger.info("Adding device %s", d.id)
        try:
            device = device_dto_to_core(
                d,
                self._driver_registry.all,
                self._transport_registry.all,
                on_update=self._on_attribute_update,
            )
            self._device_registry.register(device)
        except KeyError:
            logger.exception(
                "Cannot create device %s: missing driver or transport", d.id
            )
        except Exception:
            logger.exception("Failed to init device %s", d.id)

    @classmethod
    async def from_dto(
        cls,
        devices: list[DeviceDTO],
        drivers: list[DriverDTO],
        transports: list[TransportDTO],
    ) -> DevicesManager:
        dm = cls(
            devices={},
            drivers={},
            transports={},
        )
        for t in transports:
            try:
                dm._transport_registry.add(t)
            except Exception:
                logger.exception("Failed to init transport %s", t.id)
        for d in drivers:
            try:
                dm._driver_registry.add(d)
            except Exception:
                logger.exception("Failed to init driver %s", d.id)
        for d in devices:
            await dm._restore_device(d)
        return dm

    @classmethod
    async def from_storage(cls, url: str) -> DevicesManager:
        repository = await build_storage(url)
        dm = await cls.from_dto(
            devices=await repository.devices.read_all(),
            drivers=await repository.drivers.read_all(),
            transports=await repository.transports.read_all(),
        )
        dm._storage = repository  # noqa: SLF001
        dm._register_attribute_persistence_listener()  # noqa: SLF001
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
            device: Device,
            _attribute_name: str,
            attribute: Attribute,
        ) -> None:
            await storage.save_attribute(device.id, attribute)

        self.add_device_attribute_listener(_persist_attribute)

    # -- Transports (delegated to TransportRegistry) --

    @property
    def transport_ids(self) -> set[str]:
        return self._transport_registry.ids

    def list_transports(self) -> list[TransportDTO]:
        return self._transport_registry.list_all()

    def get_transport(self, transport_id: str) -> TransportDTO:
        return self._transport_registry.get_dto(transport_id)

    async def add_transport(
        self, transport: TransportCreateDTO | TransportDTO
    ) -> TransportDTO:
        dto = self._transport_registry.add(transport)
        if self._storage:
            await self._storage.transports.write(dto.id, dto)
        return dto

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
        transport = self._transport_registry.remove(transport_id)
        await transport.close()
        if self._storage:
            await self._storage.transports.delete(transport_id)

    async def update_transport(
        self, transport_id: str, update: TransportUpdateDTO
    ) -> TransportDTO:
        transport = self._transport_registry.update(transport_id, update)
        if update.config is not None:
            for device in self._device_registry.all.values():
                if device.transport_id == transport_id:
                    await device.init_listeners()
                    await self._restart_device_polling(device)
        dto = transport_core_to_dto(transport)
        if self._storage:
            await self._storage.transports.write(transport_id, dto)
        return dto

    # -- Drivers (delegated to DriverRegistry) --

    @property
    def driver_ids(self) -> set[str]:
        return self._driver_registry.ids

    def list_drivers(self, *, device_type: str | None = None) -> list[DriverDTO]:
        return self._driver_registry.list_all(device_type=device_type)

    @staticmethod
    def list_standard_schemas() -> list[StandardAttributeSchemaDTO]:
        return [
            standard_schema_core_to_dto(schema) for schema in default_registry.values()
        ]

    def get_driver(self, driver_id: str) -> DriverDTO:
        return self._driver_registry.get_dto(driver_id)

    async def add_driver(self, driver_dto: DriverDTO) -> DriverDTO:
        created = self._driver_registry.add(driver_dto)
        if self._storage:
            await self._storage.drivers.write(created.id, created)
        return created

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
        self._driver_registry.remove(driver_id)
        if self._storage:
            await self._storage.drivers.delete(driver_id)

    async def stop(self) -> None:
        await self.stop_polling()
        await asyncio.gather(
            *(t.close() for t in self._transport_registry.all.values())
        )
        if self._storage:
            await self._storage.close()
