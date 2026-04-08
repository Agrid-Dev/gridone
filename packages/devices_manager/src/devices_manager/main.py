from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Coroutine
from typing import TYPE_CHECKING, Any

from models.errors import ForbiddenError, InvalidError, NotFoundError

from .core.device import (
    Attribute,
    Device,
    DeviceBase,
    PhysicalDevice,
    VirtualDevice,
)
from .core.discovery_manager import (
    DiscoveryContext,
    PhysicalDevicesDiscoveryManager,
)
from .core.driver_registry import DriverRegistry
from .core.id import gen_id
from .core.standard_schemas.registry import default_registry
from .core.standard_schemas.validate import validate_standard_schema
from .core.tasks_registry import TasksRegistry
from .core.transport_registry import TransportRegistry
from .dto import (
    DeviceCreateDTO,
    DeviceDTO,
    DeviceUpdateDTO,
    DriverDTO,
    PhysicalDeviceCreateDTO,
    StandardAttributeSchemaDTO,
    TransportCreateDTO,
    TransportDTO,
    TransportUpdateDTO,
    VirtualDeviceCreateDTO,
    device_core_to_dto,
    device_dto_to_core,
    standard_schema_core_to_dto,
    transport_core_to_dto,
)
from .storage.factory import build_storage

if TYPE_CHECKING:
    from .core.driver import Driver
    from .core.transports import TransportClient
    from .storage import DevicesManagerStorage
    from .types import AttributeValueType

logger = logging.getLogger(__name__)

AttributeListener = Callable[[Device, str, Attribute], Coroutine[Any, Any, None] | None]


class DevicesManager:
    _devices: dict[str, Device]
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
        transport_registry: TransportRegistry,
        driver_registry: DriverRegistry,
    ) -> None:
        self._devices = devices
        self._transport_registry = transport_registry
        self._driver_registry = driver_registry
        self._storage = None
        self._polling_tasks = TasksRegistry()
        self._running = False
        self._attribute_update_handlers = []
        self._background_tasks = set()
        for device in self._devices.values():
            device.on_update = self._on_attribute_update

    async def start_polling(self) -> None:
        self._running = True
        for device in self._devices.values():
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

    def _validate_device_config(self, device_config: dict, driver: Driver) -> None:
        for field in driver.device_config_required:
            if field.required and field.name not in device_config:
                msg = f"Device config misses driver required field '{field.name}'"
                raise InvalidError(msg)

    def _create_virtual_device(
        self, device_create: VirtualDeviceCreateDTO
    ) -> VirtualDevice:
        if not device_create.attributes:
            msg = "Virtual device must have at least one attribute"
            raise InvalidError(msg)
        names = [a.name for a in device_create.attributes]
        if len(names) != len(set(names)):
            msg = "Duplicate attribute names in virtual device payload"
            raise InvalidError(msg)
        if device_create.type is not None:
            validate_standard_schema(device_create.type, device_create.attributes)  # ty: ignore[invalid-argument-type]
        attributes = {
            a.name: Attribute.create(a.name, a.data_type, {a.read_write_mode})
            for a in device_create.attributes
        }
        return VirtualDevice(
            id=gen_id(),
            name=device_create.name,
            type=device_create.type,
            attributes=attributes,
            on_update=self._on_attribute_update,
        )

    def _create_physical_device(
        self, device_create: PhysicalDeviceCreateDTO
    ) -> PhysicalDevice:
        driver = self._driver_registry.get(device_create.driver_id)
        self._validate_device_config(device_create.config, driver)
        transport = self._transport_registry.get(device_create.transport_id)
        DriverRegistry.check_transport_compat(driver, transport)
        base = DeviceBase(
            id=gen_id(), name=device_create.name, config=device_create.config
        )
        return PhysicalDevice.from_base(
            base,
            driver=driver,
            transport=transport,
            on_update=self._on_attribute_update,
        )

    async def _register_device(self, device: Device) -> None:
        """Register device in memory and start lifecycle if running."""
        if device.id in self._devices:
            msg = f"Device with id {device.id} already exists"
            raise ValueError(msg)
        self._devices[device.id] = device
        if self._running:
            await device.init_listeners()
            if device.polling_enabled:
                logger.info("Starting polling job for device %s", device.id)
                self._polling_tasks.add(
                    ("poll", device.id), self._device_poll_loop(device)
                )
        logger.info("Successfully registered device '%s'", device.id)

    async def add_device(self, device_create: DeviceCreateDTO) -> DeviceDTO:
        if isinstance(device_create, PhysicalDeviceCreateDTO):
            device = self._create_physical_device(device_create)
        else:
            device = self._create_virtual_device(device_create)
        await self._register_device(device)
        if self._storage:
            dto = device_core_to_dto(device)
            await self._storage.devices.write(dto.id, dto)
        logger.info(
            "Successfully created device '%s' (id: %s)",
            device_create.name,
            device.id,
        )
        return device_core_to_dto(device)

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

    async def _register_and_persist_device(self, device: Device) -> None:
        """Register device and persist to storage. Used by discovery."""
        await self._register_device(device)
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
                    d == device for d in self._devices.values()
                ),
            )
            self._discovery_manager = PhysicalDevicesDiscoveryManager(
                context=discovery_context
            )
        return self._discovery_manager

    async def _restore_device(self, d: DeviceDTO) -> None:
        logger.info("Adding device %s", d.id)
        try:
            device = device_dto_to_core(
                d,
                self._driver_registry.all,
                self._transport_registry.all,
                on_update=self._on_attribute_update,
            )
            await self._register_device(device)
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
        transport_registry = TransportRegistry()
        driver_registry = DriverRegistry()
        dm = cls(
            devices={},
            transport_registry=transport_registry,
            driver_registry=driver_registry,
        )
        for t in transports:
            try:
                transport_registry.add(t)
            except Exception:
                logger.exception("Failed to init transport %s", t.id)
        for d in drivers:
            try:
                driver_registry.add(d)
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
            (d for d in self._devices.values() if d.transport_id == transport_id),
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
            for device in self._devices.values():
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
            (d for d in self._devices.values() if d.driver_id == driver_id),
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

    # -- Devices --

    @property
    def device_ids(self) -> set[str]:
        return set(self._devices.keys())

    def list_devices(self, *, device_type: str | None = None) -> list[DeviceDTO]:
        devices = self._devices.values()
        if device_type is not None:
            devices = [d for d in devices if d.type == device_type]
        return [device_core_to_dto(device) for device in devices]

    def get_device(self, device_id: str) -> DeviceDTO:
        device = self._get_or_raise(device_id)
        return device_core_to_dto(device)

    def _get_or_raise(self, device_id: str) -> Device:
        try:
            return self._devices[device_id]
        except KeyError as e:
            msg = f"Device {device_id} not found"
            raise NotFoundError(msg) from e

    def _resolve_driver(self, driver_id: str | None) -> Driver | None:
        if driver_id is None:
            return None
        return self._driver_registry.get(driver_id)

    def _resolve_transport(self, transport_id: str | None) -> TransportClient | None:
        if transport_id is None:
            return None
        return self._transport_registry.get(transport_id)

    def _rebuild_physical_device(
        self,
        device: PhysicalDevice,
        driver: Driver,
        transport: TransportClient,
    ) -> PhysicalDevice:
        initial_values = {
            name: attr.current_value
            for name, attr in device.attributes.items()
            if attr.current_value is not None
        }
        return PhysicalDevice.from_base(
            DeviceBase(id=device.id, name=device.name, config=device.config),
            driver=driver,
            transport=transport,
            initial_values=initial_values,
            on_update=self._on_attribute_update,
        )

    def _mutate_virtual_attributes(
        self, device: VirtualDevice, device_update: DeviceUpdateDTO
    ) -> None:
        if device_update.attributes is None:
            return
        incoming = {a.name: a for a in device_update.attributes}
        for name, attr_dto in incoming.items():
            existing = device.attributes.get(name)
            if existing is not None and existing.data_type != attr_dto.data_type:
                msg = f"Cannot change data_type of existing attribute '{name}'"
                raise InvalidError(msg)
        new_attributes = {
            name: (
                device.attributes[name]
                if name in device.attributes
                else Attribute.create(
                    attr_dto.name, attr_dto.data_type, {attr_dto.read_write_mode}
                )
            )
            for name, attr_dto in incoming.items()
        }
        if device.type is not None:
            validate_standard_schema(device.type, list(device_update.attributes))
        device.attributes = new_attributes

    async def update_device(
        self, device_id: str, device_update: DeviceUpdateDTO
    ) -> DeviceDTO:
        device = self._get_or_raise(device_id)

        if isinstance(device, VirtualDevice):
            if device_update.name is not None:
                device.name = device_update.name
            self._mutate_virtual_attributes(device, device_update)
            dto = device_core_to_dto(device)
            if self._storage:
                await self._storage.devices.write(device_id, dto)
            return dto

        assert isinstance(device, PhysicalDevice)  # noqa: S101
        new_driver = self._resolve_driver(device_update.driver_id)
        new_transport = self._resolve_transport(device_update.transport_id)
        effective_driver = new_driver or device.driver
        effective_transport = new_transport or device.transport

        DriverRegistry.check_transport_compat(effective_driver, effective_transport)

        if device_update.name is not None:
            device.name = device_update.name
        if device_update.config is not None:
            device.config = device_update.config

        if new_driver is not None:
            self._validate_device_config(device.config, new_driver)
        elif device_update.config is not None:
            self._validate_device_config(device_update.config, device.driver)

        if new_driver is not None or new_transport is not None:
            self._devices[device_id] = self._rebuild_physical_device(
                device, effective_driver, effective_transport
            )
            await self._devices[device_id].init_listeners()

        await self._restart_device_polling(self._devices[device_id])

        dto = device_core_to_dto(self._devices[device_id])
        if self._storage:
            await self._storage.devices.write(device_id, dto)
        return dto

    async def write_device_attribute(
        self,
        device_id: str,
        attribute_name: str,
        value: AttributeValueType,
        *,
        confirm: bool = True,
    ) -> Attribute:
        device = self._get_or_raise(device_id)
        if attribute_name not in device.attributes:
            msg = f"Attribute '{attribute_name}' not found on device {device_id}"
            raise NotFoundError(msg)
        return await device.write_attribute_value(
            attribute_name, value, confirm=confirm
        )

    async def delete_device(self, device_id: str) -> None:
        self._get_or_raise(device_id)
        polling_key = ("poll", device_id)
        if self._polling_tasks.has(polling_key):
            await self._polling_tasks.remove(polling_key)
        del self._devices[device_id]
        if self._storage:
            await self._storage.devices.delete(device_id)

    async def read_device(self, device_id: str) -> DeviceDTO:
        device = self._get_or_raise(device_id)
        if not self._running:
            await device.update_once()
        return device_core_to_dto(device)

    async def stop(self) -> None:
        await self.stop_polling()
        await asyncio.gather(
            *(t.close() for t in self._transport_registry.all.values())
        )
        if self._storage:
            await self._storage.close()
