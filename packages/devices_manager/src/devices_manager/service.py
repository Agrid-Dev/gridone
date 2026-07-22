from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel

from models.errors import (
    ConflictError,
    InvalidError,
    NotFoundError,
    StorageNotInitializedError,
)
from models.ids import gen_id
from models.service import Service

from .core.device import (
    Attribute,
    CoreDevice,
    FaultAttribute,
)
from .core.device_registry import DeviceRegistry
from .core.discovery_manager import (
    DevicesDiscoveryManager,
    DiscoveryContext,
)
from .core.driver_registry import DriverRegistry
from .core.standard_schemas.registry import default_registry
from .core.transport_registry import TransportRegistry, build_transport_client
from .core.transports import TransportClient
from .dto import (
    AttributePatch,
    Device,
    DeviceBatchItem,
    DeviceBatchItemResult,
    DeviceCreate,
    DeviceUpdate,
    DriverPatch,
    DriverSpec,
    FaultView,
    LoadError,
    StandardAttributeSchema,
    Transport,
    TransportCreate,
    TransportUpdate,
    device_from_public,
    device_to_public,
    driver_from_public,
    standard_schema_to_public,
    transport_to_public,
)
from .storage.factory import build_storage

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Collection

    from models.types import Severity

    from .core.device.event_log import AttributeLogs
    from .core.driver import Driver
    from .core.driver.attribute_driver import AttributeDriver
    from .core.transports import TransportClient
    from .dto import LoadEntityKind
    from .interface import AttributeListener, DeviceDiscoveredListener
    from .storage import DevicesManagerStorage, StorageBackend
    from .types import AttributeValueType, DataType

logger = logging.getLogger(__name__)

# Upper bound on how long a transport close() may take. close() now waits out
# any in-flight read (AGR-928), so callers on a request/shutdown path need a
# cap rather than an open-ended wait.
TRANSPORT_CLOSE_TIMEOUT_SECONDS = 10


async def _close_transport(transport: TransportClient) -> None:
    try:
        await asyncio.wait_for(
            transport.close(), timeout=TRANSPORT_CLOSE_TIMEOUT_SECONDS
        )
    except TimeoutError:
        logger.warning("Transport %s close() timed out, abandoning it", transport.id)


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
        data_type=attr.data_type,
        severity=attr.severity,
        current_value=attr.current_value,
        last_updated=attr.last_updated,
        last_changed=attr.last_changed,
    )


@dataclass
class _LoadedState:
    """Storage and registries, built together by :meth:`DevicesService.load`."""

    storage: DevicesManagerStorage
    transport_registry: TransportRegistry
    driver_registry: DriverRegistry
    device_registry: DeviceRegistry


class DevicesService(Service):
    _discovery_manager: DevicesDiscoveryManager

    def __init__(
        self,
        storage_url: str | None = None,
        *,
        drivers: dict[str, Driver] | None = None,
        transports: dict[str, TransportClient] | None = None,
        devices: dict[str, CoreDevice] | None = None,
    ) -> None:
        self._storage_url = storage_url
        self._seed_drivers = drivers if drivers is not None else {}
        self._seed_transports = transports if transports is not None else {}
        self._seed_devices = devices if devices is not None else {}
        self._loaded: _LoadedState | None = None
        self._load_errors: list[LoadError] = []
        self._running = False
        self._attribute_update_handlers: dict[str, AttributeListener] = {}
        self._discovery_listeners: dict[str, DeviceDiscoveredListener] = {}
        self._background_tasks: set[asyncio.Task[Any]] = set()

    @property
    def _state(self) -> _LoadedState:
        if self._loaded is None:
            msg = "DevicesService used before load() or start()"
            raise StorageNotInitializedError(msg)
        return self._loaded

    @property
    def _storage(self) -> DevicesManagerStorage:
        return self._state.storage

    @property
    def _transport_registry(self) -> TransportRegistry:
        return self._state.transport_registry

    @property
    def _driver_registry(self) -> DriverRegistry:
        return self._state.driver_registry

    @property
    def _device_registry(self) -> DeviceRegistry:
        return self._state.device_registry

    # -- Lifecycle --

    async def start(self) -> None:
        """Load from storage, then start syncing devices."""
        await self.load()
        self._register_attribute_persistence_listener()
        self._running = True
        for device in self._device_registry.all.values():
            try:
                await device.start_sync()
            except Exception:
                logger.exception("Failed to start sync for device %s", device.id)

    async def load(self) -> None:
        """Build storage and registries once, and hydrate them read-only.

        Single-phase: the storage backend is built once and the registries
        are constructed directly against it, pre-populated with the stored
        entities. Hydration performs no writes, starts no background sync
        and registers no persistence listener.

        Fault-tolerant per stored entity: an unreadable or unresolvable
        entry is skipped and recorded in :attr:`load_errors`, never fatal.
        Backend-level failures still raise (``UnsupportedStorageError``,
        ``StorageConnectionError``).
        """
        storage = await build_storage(self._storage_url)
        self._load_errors = []
        transports = await self._load_transports(storage)
        drivers = await self._load_drivers(storage)
        devices = await self._load_devices(storage, drivers, transports)
        transport_registry = TransportRegistry(transports, storage=storage.transports)
        driver_registry = DriverRegistry(drivers, storage=storage.drivers)
        device_registry = DeviceRegistry(
            devices,
            resolve_driver=driver_registry.get,
            resolve_transport=transport_registry.get,
            on_attribute_update=self._on_attribute_update,
            storage=storage.devices,
        )
        self._loaded = _LoadedState(
            storage=storage,
            transport_registry=transport_registry,
            driver_registry=driver_registry,
            device_registry=device_registry,
        )

    async def stop(self) -> None:
        """Stop syncing, close transports, and release storage. Idempotent."""
        self._running = False
        if self._loaded is None:
            return
        for device in self._device_registry.all.values():
            await device.stop_sync()
        await asyncio.gather(
            *(_close_transport(t) for t in self._transport_registry.all.values())
        )
        await self._storage.close()

    @property
    def load_errors(self) -> list[LoadError]:
        """Entities skipped during the last :meth:`load`. Empty on a clean boot."""
        return list(self._load_errors)

    # -- Read-only hydration (seeded entities win over stored duplicates) --

    def _record_load_error(
        self, kind: LoadEntityKind, entity_id: str, reason: str
    ) -> None:
        """Record a skipped entity. Must be called from an ``except`` block."""
        self._load_errors.append(
            LoadError(kind=kind, entity_id=entity_id, reason=reason)
        )
        logger.exception("Skipped %s '%s' during load: %s", kind, entity_id, reason)

    async def _read_entities[M: BaseModel](
        self, backend: StorageBackend[M], kind: LoadEntityKind
    ) -> list[M]:
        """Read stored entities one by one, skipping unreadable entries."""
        entities: list[M] = []
        for item_id in await backend.list_all():
            try:
                entities.append(await backend.read(item_id))
            except Exception:  # noqa: BLE001 -- fault-tolerant load
                self._record_load_error(kind, item_id, "unreadable entry")
        return entities

    async def _load_transports(
        self, storage: DevicesManagerStorage
    ) -> dict[str, TransportClient]:
        transports = dict(self._seed_transports)
        for dto in await self._read_entities(storage.transports, "transport"):
            if dto.id in transports:
                continue
            try:
                transports[dto.id] = build_transport_client(dto)
            except Exception:  # noqa: BLE001 -- fault-tolerant load
                self._record_load_error("transport", dto.id, "failed to initialize")
        return transports

    async def _load_drivers(self, storage: DevicesManagerStorage) -> dict[str, Driver]:
        drivers = dict(self._seed_drivers)
        for dto in await self._read_entities(storage.drivers, "driver"):
            if dto.id in drivers:
                continue
            try:
                drivers[dto.id] = driver_from_public(dto)
            except Exception:  # noqa: BLE001 -- fault-tolerant load
                self._record_load_error("driver", dto.id, "failed to initialize")
        return drivers

    async def _load_devices(
        self,
        storage: DevicesManagerStorage,
        drivers: dict[str, Driver],
        transports: dict[str, TransportClient],
    ) -> dict[str, CoreDevice]:
        devices = dict(self._seed_devices)
        for dto in await self._read_entities(storage.devices, "device"):
            if dto.id in devices:
                continue
            try:
                devices[dto.id] = device_from_public(
                    dto, drivers, transports, on_update=self._on_attribute_update
                )
            except KeyError:
                self._record_load_error("device", dto.id, "missing driver or transport")
            except Exception:  # noqa: BLE001 -- fault-tolerant load
                self._record_load_error("device", dto.id, "failed to initialize")
        return devices

    def _register_attribute_persistence_listener(self) -> None:
        """Persist attribute values on change.

        The listener is async and fire-and-forget: it does not block the
        polling or write hot path.
        """
        storage = self._storage

        async def _persist_attribute(
            device: CoreDevice,
            _attribute_name: str,
            _previous: Attribute | None,
            attribute: Attribute,
        ) -> None:
            await storage.save_attribute(device.id, attribute)

        self.add_device_attribute_listener(_persist_attribute)

    # -- Devices (delegated to DeviceRegistry) --

    @property
    def device_ids(self) -> set[str]:
        return self._device_registry.ids

    def list_devices(  # noqa: PLR0913
        self,
        *,
        ids: Collection[str] | None = None,
        types: list[str] | None = None,
        writable_attribute: str | None = None,
        writable_attribute_type: DataType | None = None,
        tags: dict[str, list[str]] | None = None,
        is_faulty: bool | None = None,
        search: str | None = None,
        driver_id: str | None = None,
        transport_id: str | None = None,
    ) -> list[Device]:
        return self._device_registry.list_all(
            ids=ids,
            types=types,
            writable_attribute=writable_attribute,
            writable_attribute_type=writable_attribute_type,
            tags=tags,
            is_faulty=is_faulty,
            search=search,
            driver_id=driver_id,
            transport_id=transport_id,
        )

    def get_device(self, device_id: str) -> Device:
        return self._device_registry.get_dto(device_id)

    async def add_device(self, device_create: DeviceCreate) -> Device:
        device = await self._device_registry.add(device_create)
        if self._running:
            await device.start_sync()
        return device_to_public(device)

    async def add_devices_batch(
        self,
        driver_id: str,
        transport_id: str,
        items: list[DeviceBatchItem],
    ) -> list[DeviceBatchItemResult]:
        """Create many devices sharing one driver + transport.

        A thin loop over `add_device`: each entry is attempted independently
        and one entry's failure does not block the others (partial success).
        """
        if not items:
            msg = "Batch device list must not be empty"
            raise InvalidError(msg)

        results: list[DeviceBatchItemResult] = []
        for item in items:
            create = DeviceCreate(
                name=item.name,
                config=item.config,
                driver_id=driver_id,
                transport_id=transport_id,
            )
            try:
                device = await self.add_device(create)
            except (ValueError, NotFoundError, ConflictError) as e:
                results.append(DeviceBatchItemResult(error=str(e)))
            else:
                results.append(DeviceBatchItemResult(device=device))
        return results

    async def update_device(
        self, device_id: str, device_update: DeviceUpdate
    ) -> Device:
        old_device = self._device_registry.get(device_id)
        await old_device.stop_sync()
        try:
            device = await self._device_registry.update(device_id, device_update)
        except Exception:
            if self._running:
                await old_device.start_sync()
            raise
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
        """Force a fresh read of the device's attributes.

        Distinct from :meth:`get_device`, which returns the cached DTO
        without contacting the transport. Polling, when running, also
        refreshes attributes in the background — this method exists so
        callers can request data on demand.
        """
        device = self._device_registry.get(device_id)
        await device.update_once()
        return device_to_public(device)

    async def refresh_device_attribute(
        self, device_id: str, attribute_name: str
    ) -> Attribute:
        """Force a fresh read of a single attribute, on demand."""
        return await self._device_registry.refresh_attribute(device_id, attribute_name)

    def stream_device_read(
        self, device_id: str
    ) -> AsyncIterator[tuple[str, AttributeValueType | None]]:
        """Read a device's attributes on demand, yielding ``(name, value)`` as
        each one lands so callers can render progress rather than waiting for the
        whole device. Like :meth:`read_device`, it contacts the transport.
        """
        return self._device_registry.get(device_id).stream_read()

    async def start_device_sync(self, device_id: str) -> None:
        """Start background polling for a single device."""
        await self._device_registry.get(device_id).start_sync()

    async def stop_device_sync(self, device_id: str) -> None:
        """Stop background polling for a single device."""
        await self._device_registry.get(device_id).stop_sync()

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

    def get_attribute_logs(self, device_id: str, attribute_name: str) -> AttributeLogs:
        return self._device_registry.get_attribute_logs(device_id, attribute_name)

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
        self,
        device: CoreDevice,
        attribute_name: str,
        previous: Attribute | None,
        attribute: Attribute,
    ) -> None:
        """Dispatch attribute update to all registered handlers."""
        for handler in self._attribute_update_handlers.values():
            try:
                self._schedule_if_coroutine(
                    handler(device, attribute_name, previous, attribute)
                )
            except Exception:
                logger.exception(
                    "Attribute update handler failed for %s.%s",
                    device.id,
                    attribute_name,
                )

    def _on_handler_task_done(self, task: asyncio.Task[Any]) -> None:
        self._background_tasks.discard(task)
        if not task.cancelled() and (exc := task.exception()):
            logger.error("Async handler failed", exc_info=exc)

    def _schedule_if_coroutine(self, result: object) -> None:
        if asyncio.iscoroutine(result):
            task = asyncio.create_task(result)
            self._background_tasks.add(task)
            task.add_done_callback(self._on_handler_task_done)

    def add_device_attribute_listener(self, callback: AttributeListener) -> str:
        """Register a handler for attribute updates. Returns an opaque listener ID."""
        listener_id = gen_id()
        self._attribute_update_handlers[listener_id] = callback
        return listener_id

    def remove_device_attribute_listener(self, listener_id: str) -> None:
        """Unregister a previously registered attribute update handler."""
        self._attribute_update_handlers.pop(listener_id, None)

    def add_device_discovery_listener(self, callback: DeviceDiscoveredListener) -> str:
        """Register a handler called when a new device is discovered."""
        listener_id = gen_id()
        self._discovery_listeners[listener_id] = callback
        return listener_id

    def remove_device_discovery_listener(self, listener_id: str) -> None:
        """Unregister a previously registered discovery handler."""
        self._discovery_listeners.pop(listener_id, None)

    # -- Discovery --

    async def _register_and_persist_device(self, device: CoreDevice) -> None:
        """Register device and persist to storage. Used by discovery."""
        await self._device_registry.register(device)
        if self._running:
            await device.start_sync()
        for listener in self._discovery_listeners.values():
            try:
                self._schedule_if_coroutine(listener(device))
            except Exception:
                logger.exception("Discovery listener failed for device %s", device.id)

    @property
    def discovery_manager(self) -> DevicesDiscoveryManager:
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
            self._discovery_manager = DevicesDiscoveryManager(context=discovery_context)
        return self._discovery_manager

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
            raise ConflictError(msg)

    async def delete_transport(self, transport_id: str) -> None:
        self._transport_registry.get(transport_id)
        self._assert_transport_not_used(transport_id)
        transport = await self._transport_registry.remove(transport_id)
        await _close_transport(transport)

    async def update_transport(
        self, transport_id: str, update: TransportUpdate
    ) -> Transport:
        transport = await self._transport_registry.update(transport_id, update)
        if update.config is not None and self._running:
            await self._device_registry.restart_devices(transport_id=transport_id)
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

    async def patch_driver(self, driver_id: str, patch: DriverPatch) -> DriverSpec:
        result = await self._driver_registry.patch(driver_id, patch)
        if "type" in patch.model_fields_set:
            self._device_registry.update_type_in_devices(
                result.type, driver_id=driver_id
            )
        if self._running:
            await self._device_registry.restart_devices(driver_id=driver_id)
        return result

    async def create_driver_attribute(
        self,
        driver_id: str,
        attribute: AttributeDriver,
    ) -> AttributeDriver:
        result = await self._driver_registry.create_driver_attribute(
            driver_id, attribute
        )
        self._device_registry.rebuild_attribute_in_devices(result, driver_id=driver_id)
        if self._running:
            await self._device_registry.restart_devices(driver_id=driver_id)
        return result

    async def patch_driver_attribute(
        self,
        driver_id: str,
        attribute_id: str,
        patch: AttributePatch,
    ) -> AttributeDriver:
        result = await self._driver_registry.patch_driver_attribute(
            driver_id, attribute_id, patch
        )
        self._device_registry.rebuild_attribute_in_devices(result, driver_id=driver_id)
        if self._running:
            await self._device_registry.restart_devices(driver_id=driver_id)
        return result

    async def delete_driver_attribute(
        self, driver_id: str, attribute_id: str
    ) -> DriverSpec:
        result = await self._driver_registry.delete_driver_attribute(
            driver_id, attribute_id
        )
        self._device_registry.delete_attribute_in_devices(
            attribute_id, driver_id=driver_id
        )
        if self._running:
            await self._device_registry.restart_devices(driver_id=driver_id)
        return result

    async def rename_driver_attribute(
        self, driver_id: str, attribute_id: str, new_name: str
    ) -> AttributeDriver:
        result = await self._driver_registry.rename_driver_attribute(
            driver_id, attribute_id, new_name
        )
        self._device_registry.rename_attribute_in_devices(
            attribute_id, new_name, driver_id=driver_id
        )
        if self._running:
            await self._device_registry.restart_devices(driver_id=driver_id)
        return result

    def _assert_driver_not_used(self, driver_id: str) -> None:
        device = next(
            (d for d in self._device_registry.all.values() if d.driver_id == driver_id),
            None,
        )
        if device is not None:
            msg = f"Driver {driver_id} is used by device {device.id}"
            raise ConflictError(msg)

    async def delete_driver(self, driver_id: str) -> None:
        self._driver_registry.get(driver_id)
        self._assert_driver_not_used(driver_id)
        await self._driver_registry.remove(driver_id)
