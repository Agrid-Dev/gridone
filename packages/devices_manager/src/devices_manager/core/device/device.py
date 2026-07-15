from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from devices_manager.core.driver import FaultAttributeDriver
from devices_manager.core.transports import PushTransportClient, ReadError
from devices_manager.core.utils.templating.render import render_struct
from models.errors import ConfirmationError, InvalidError, NotFoundError
from models.ids import gen_id

from .attribute import Attribute, AttributeKind, FaultAttribute
from .connection_status import (
    CONNECTION_STATUS_ATTR,
    build_cs_attribute,
    compute_connection_status,
)
from .event_log import EventType, build_entry, log_event, wrap_listen
from .watchdog import SilenceWatchdog

if TYPE_CHECKING:
    from devices_manager.core.codecs import FnCodec
    from devices_manager.core.driver import AttributeDriver, Driver
    from devices_manager.core.transports import (
        ReadResult,
        TransportAddress,
        TransportClient,
    )
    from devices_manager.types import (
        AttributeValueType,
        ConnectionStatus,
        DataType,
        DeviceConfig,
        ReadWriteMode,
    )

    from .device_base import DeviceBase
    from .event_log import AttributeEventLog

logger = logging.getLogger(__name__)

DEFAULT_CONFIRM_TIMEOUT: float = 5.0

# (device, attribute_name, previous, new). `previous` is `None` for the first
# event ever observed for this attribute (i.e. its `current_value` was `None`
# before the mutation); otherwise it's an immutable snapshot of the attribute's
# state before the value changed. On the first post-restart event `previous`
# reflects the persisted state, not `None`. Listeners can compare `previous`
# and `new` to detect transitions without maintaining per-listener state.
AttributeListener = Callable[
    ["CoreDevice", str, "Attribute | None", Attribute],
    Awaitable[None] | None,
]


def _build_attribute(
    attribute_driver: AttributeDriver,
    initial_value: AttributeValueType | None,
    *,
    restored: Attribute | None = None,
) -> Attribute:
    """Construct the runtime Attribute that matches the driver's kind.

    FaultAttributeDriver → FaultAttribute (carries healthy_values +
    severity so the is_faulty computed property has what it needs).

    `restored` carries this attribute's previous runtime state (e.g. from
    storage or a pre-rebuild device) to resume from verbatim — value and
    both timestamps copied as-is, even if only one timestamp is set. When
    absent, a non-None initial_value is a genuinely new value (e.g. from
    discovery) and gets stamped with the current time.
    """
    modes: set[ReadWriteMode] = (
        {"read", "write"} if attribute_driver.write is not None else {"read"}
    )
    if restored is not None:
        current_value = restored.current_value
        last_updated = restored.last_updated
        last_changed = restored.last_changed
    else:
        now = datetime.now(UTC) if initial_value is not None else None
        current_value = initial_value
        last_updated = now
        last_changed = now
    if isinstance(attribute_driver, FaultAttributeDriver):
        return FaultAttribute(
            name=attribute_driver.name,
            data_type=attribute_driver.data_type,
            read_write_modes=modes,
            current_value=current_value,
            last_updated=last_updated,
            last_changed=last_changed,
            healthy_values=attribute_driver.healthy_values,
            severity=attribute_driver.severity,
        )
    return Attribute(
        name=attribute_driver.name,
        data_type=attribute_driver.data_type,
        read_write_modes=modes,
        current_value=current_value,
        last_updated=last_updated,
        last_changed=last_changed,
        value_options=attribute_driver.value_options,
    )


@dataclass(kw_only=True)
class CoreDevice:
    id: str
    name: str
    attributes: dict[str, Attribute]
    driver: Driver
    transport: TransportClient
    config: DeviceConfig
    type: str | None = field(init=False, default=None)
    tags: dict[str, str] = field(default_factory=dict)
    on_update: AttributeListener | None = field(default=None, repr=False)
    _syncing: bool = field(init=False, default=False, repr=False)
    _waiters: list[tuple[str, Callable[[AttributeValueType], bool], asyncio.Event]] = (
        field(init=False, default_factory=list, repr=False)
    )
    _poll_tasks: dict[str | None, asyncio.Task[None]] = field(
        init=False, default_factory=dict, repr=False
    )
    _watchdog: SilenceWatchdog | None = field(init=False, default=None, repr=False)

    def __post_init__(self) -> None:
        if self.driver.transport != self.transport.protocol:
            msg = (
                f"Protocol mismatch: cannot use {self.driver.transport} driver"
                f" with {self.transport.protocol} transport"
            )
            raise TypeError(msg)
        self.type = self.driver.type

    @property
    def syncing(self) -> bool:
        """Whether this device is actively synchronizing."""
        return self._syncing

    @property
    def driver_id(self) -> str:
        return self.driver.metadata.id

    @property
    def transport_id(self) -> str:
        return self.transport.id

    @property
    def polling_enabled(self) -> bool:
        return self.driver.update_strategy.polling_enabled

    @property
    def poll_interval(self) -> float | None:
        return self.driver.update_strategy.polling_interval

    @property
    def expected_interval(self) -> float | None:
        push_interval = self.driver.healthcheck.expected_push_interval
        return float(push_interval) if push_interval is not None else None

    @property
    def is_faulty(self) -> bool:
        return any(
            isinstance(a, FaultAttribute) and a.is_faulty
            for a in self.attributes.values()
        )

    def rebuild_attribute(self, attribute_driver: AttributeDriver) -> None:
        """Add or rebuild a single runtime attribute from its driver spec.

        Preserves the attribute's current_value and timestamps so live
        telemetry and fault age are not lost; a new attribute (no prior
        value) starts at None.
        """
        existing = self.attributes.get(attribute_driver.name)
        self.attributes[attribute_driver.name] = _build_attribute(
            attribute_driver, None, restored=existing
        )

    def delete_attribute(self, attribute_name: str) -> None:
        """Delete a runtime attribute that no longer exists on the driver."""
        self.attributes.pop(attribute_name, None)

    def rename_attribute(self, old_name: str, new_name: str) -> None:
        """Rename a runtime attribute in place, preserving all of its state."""
        existing = self.attributes.pop(old_name, None)
        if existing is not None:
            self.attributes[new_name] = existing.model_copy(update={"name": new_name})

    @classmethod
    def from_base(  # noqa: PLR0913
        cls,
        base: DeviceBase,
        *,
        transport: TransportClient,
        driver: Driver,
        initial_values: dict[str, AttributeValueType] | None = None,
        restored_attributes: dict[str, Attribute] | None = None,
        on_update: AttributeListener | None = None,
    ) -> CoreDevice:
        initial = initial_values or {}
        restored = restored_attributes or {}
        return cls(
            id=base.id,
            name=base.name,
            config=base.config,
            driver=driver,
            transport=transport,
            on_update=on_update,
            attributes={
                **{
                    a.name: _build_attribute(
                        a, initial.get(a.name), restored=restored.get(a.name)
                    )
                    for a in driver.attributes.values()
                },
                CONNECTION_STATUS_ATTR: build_cs_attribute(
                    initial.get(CONNECTION_STATUS_ATTR),  # type: ignore[arg-type]
                    restored=restored.get(CONNECTION_STATUS_ATTR),
                ),
            },
        )

    @contextlib.asynccontextmanager
    async def wait_for_attribute(
        self,
        name: str,
        predicate: Callable[[AttributeValueType], bool],
    ) -> AsyncIterator[asyncio.Event]:
        """Async context manager that yields an Event set when predicate matches.

        Both push listeners and active reads go through _update_attribute, so
        any update path naturally triggers confirmation without special-casing.
        The waiter is always removed from the registry on exit (success,
        timeout, or cancellation).
        """
        event = asyncio.Event()
        waiter = (name, predicate, event)
        self._waiters.append(waiter)
        try:
            yield event
        finally:
            self._waiters.remove(waiter)

    async def init_listeners(self) -> None:
        """Upon init, attach attribute updaters to the transport."""
        if not isinstance(self.transport, PushTransportClient):
            return
        context = {
            **self.driver.env,
            **self.config,
        }
        for attribute in self.attributes.values():
            if attribute.kind == AttributeKind.INTERNAL:
                continue
            attribute_driver = self.driver.attributes[attribute.name]
            codec = attribute_driver.codec
            address = self.transport.build_address(
                render_struct(attribute_driver.read, context), context
            )
            await self.transport.register_listener(
                address.topic, self._make_on_message(codec, attribute)
            )

    def _make_on_message(
        self, codec: FnCodec, attribute: Attribute
    ) -> Callable[[object], None]:
        def on_message(v: object) -> None:
            try:
                decoded = codec.decode(v)
            except Exception:  # noqa: BLE001 - best-effort: frame may not carry this attr
                return
            logger.debug(
                "Attribute %s of device %s updated to value %s by listener",
                attribute.name,
                self.id,
                decoded,
            )
            self._update_attribute(attribute, decoded)

        return wrap_listen(
            on_message,
            attribute,
            on_append=self._on_log_append,
            on_data=self._on_data_received,
        )

    async def start_sync(self) -> None:
        """Start listeners, polling, and silence watchdog for this device."""
        await self.init_listeners()
        if self.polling_enabled:
            for group_name, (interval, names) in self._polling_groups().items():
                task = self._poll_tasks.get(group_name)
                if task is None or task.done():
                    self._poll_tasks[group_name] = asyncio.create_task(
                        self._poll_loop(interval, names)
                    )
        interval = self.expected_interval
        if interval is not None:
            self._watchdog = SilenceWatchdog(interval, self._set_watchdog_status)
            await self._watchdog.start()
        self._syncing = True

    async def stop_sync(self) -> None:
        """Cancel polling, watchdog, and mark as not syncing."""
        for task in self._poll_tasks.values():
            if not task.done():
                task.cancel()
        for task in self._poll_tasks.values():
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception(
                    "[Device %s] poll group task ended with an error", self.id
                )
        self._poll_tasks.clear()
        if self._watchdog is not None:
            await self._watchdog.stop()
            self._watchdog = None
        self._syncing = False

    def _polling_groups(self) -> dict[str | None, tuple[float, list[str]]]:
        """Bucket readable, non-internal attributes by polling group.

        Attributes with no `polling_group` fall into an implicit ``None``
        bucket, polled at the driver's `polling_interval`.
        """
        names_by_group: dict[str | None, list[str]] = {}
        for attr_name, attr in self.attributes.items():
            if (
                "read" not in attr.read_write_modes
                or attr.kind == AttributeKind.INTERNAL
            ):
                continue
            group_name = self.driver.attributes[attr_name].polling_group
            names_by_group.setdefault(group_name, []).append(attr_name)
        polling_groups = self.driver.update_strategy.polling_groups
        default_interval = self.poll_interval
        result: dict[str | None, tuple[float, list[str]]] = {}
        for group_name, names in names_by_group.items():
            if group_name is not None:
                result[group_name] = (polling_groups[group_name], names)
            elif default_interval is not None:
                result[group_name] = (default_interval, names)
        return result

    async def _poll_loop(self, interval: float, attribute_names: list[str]) -> None:
        try:
            while True:
                await self._read_group(attribute_names)
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            return

    async def _read_group(self, attribute_names: list[str]) -> None:
        """One polling-group sweep: a single ``read_many`` call sharing one
        ``correlation_id``, with each result applied as it streams in.

        Building one attribute's address must never abort the sweep for its
        siblings, so failures here are isolated per attribute — mirroring how
        ``read_many`` already isolates failures per network read.
        """
        correlation_id = gen_id()
        context = {**self.driver.env, **self.config}
        addresses: list[TransportAddress] = []
        attr_names_by_address_id: dict[str, list[str]] = {}
        for attr_name in attribute_names:
            # The group's attribute list is snapshotted at task-start; a driver
            # patch can rename/delete an attribute before the device restarts
            # to pick up the change, so a stale name is skipped, not fatal.
            attribute_driver = self.driver.attributes.get(attr_name)
            if attribute_driver is None:
                continue
            try:
                address = self.transport.build_address(
                    render_struct(attribute_driver.read, context), context
                )
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "[Device %s] failed to build address for %s — %s: %s",
                    self.id,
                    attr_name,
                    type(e).__name__,
                    e,
                )
                continue
            addresses.append(address)
            attr_names_by_address_id.setdefault(address.id, []).append(attr_name)
        # read_many() dedupes addresses by .id internally; no need to do it here too.
        async for result in self.transport.read_many(addresses, correlation_id):
            for attr_name in attr_names_by_address_id.get(result.address_id, []):
                self._apply_read_result(attr_name, result)

    def _log_read_outcome(self, attribute: Attribute, error: Exception | None) -> None:
        """Record a read/decode outcome in the attribute's event log and
        recompute connection_status from it — the same bookkeeping
        ``read_attribute_value``'s ``@log_event`` decorator performs, needed
        here too since group sweeps update attributes without going through
        that decorator."""
        attribute.append_log(build_entry(EventType.READ, error))
        self._on_log_append()

    def _apply_read_result(self, attr_name: str, result: ReadResult) -> None:
        attribute = self.attributes.get(attr_name)
        if attribute is None:
            return
        if isinstance(result, ReadError):
            self._log_read_outcome(attribute, result.error)
            logger.warning(
                "[Device %s] poll read failed for %s — %s: %s",
                self.id,
                attr_name,
                type(result.error).__name__,
                result.error,
            )
            return
        attribute_driver = self.driver.attributes.get(attr_name)
        if attribute_driver is None:
            return
        try:
            decoded_value = attribute_driver.codec.decode(result.value)
        except Exception as e:  # noqa: BLE001
            self._log_read_outcome(attribute, e)
            logger.warning(
                "[Device %s] failed to decode attribute %s — %s: %s",
                self.id,
                attr_name,
                type(e).__name__,
                e,
            )
            return
        self._log_read_outcome(attribute, None)
        try:
            self._update_attribute(attribute, decoded_value)
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "[Device %s] on_update listener failed for %s — %s: %s",
                self.id,
                attr_name,
                type(e).__name__,
                e,
            )

    async def _poll_attribute(self, attribute_name: str) -> None:
        """Poll attribute_name with exponential backoff until cancelled."""
        delay = 0.25
        while True:
            await asyncio.sleep(delay)
            try:
                await self.read_attribute_value(attribute_name)
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "[Device %s] poll read failed for %s — %s: %s",
                    self.id,
                    attribute_name,
                    type(e).__name__,
                    e,
                )
            delay = min(delay * 4, 4.0)

    def get_attribute(self, attribute_name: str) -> Attribute:
        try:
            return self.attributes[attribute_name]
        except KeyError as ke:
            msg = f"Attribute '{attribute_name}' not found in device '{self.id}'"
            raise NotFoundError(msg) from ke

    def get_attribute_value(self, attribute_name: str) -> AttributeValueType | None:
        return self.get_attribute(attribute_name).current_value

    def can_write(
        self,
        attribute_name: str,
        *,
        data_type: DataType | None = None,
    ) -> bool:
        attribute = self.attributes.get(attribute_name)
        if attribute is None or "write" not in attribute.read_write_modes:
            return False
        return data_type is None or attribute.data_type == data_type

    def _update_attribute(
        self,
        attribute: Attribute,
        new_value: AttributeValueType | None,
    ) -> None:
        # Compared here so Attribute stays unaware of the listener contract.
        previous_value = attribute.current_value
        previous = attribute.model_copy() if previous_value is not None else None
        attribute.update_value(new_value)  # ty:ignore[invalid-argument-type]
        if new_value is not None:
            for wname, pred, event in self._waiters:
                if wname == attribute.name and pred(new_value):
                    event.set()
        if self.on_update and attribute.current_value != previous_value:
            self.on_update(self, attribute.name, previous, attribute)

    @log_event(EventType.READ)
    async def read_attribute_value(
        self,
        attribute_name: str,
        *,
        correlation_id: str | None = None,
        _log_attribute: Attribute | None = None,
    ) -> AttributeValueType:
        attribute = _log_attribute or self.get_attribute(attribute_name)
        if attribute.kind == AttributeKind.INTERNAL:
            msg = f"Cannot read internal attribute '{attribute_name}' via transport"
            raise InvalidError(msg)
        context = {
            **self.driver.env,
            **self.config,
        }
        attribute_driver = self.driver.attributes[attribute.name]
        address = self.transport.build_address(
            render_struct(attribute_driver.read, context), context
        )
        raw_value = await self.transport.read(address, correlation_id)
        codec = attribute_driver.codec
        decoded_value = codec.decode(raw_value)
        self._update_attribute(attribute, decoded_value)
        return attribute.current_value  # ty:ignore[invalid-return-type]

    def _on_data_received(self) -> None:
        if self._watchdog is not None:
            self._watchdog.record_data()

    def _on_log_append(self) -> None:
        with contextlib.suppress(Exception):
            self._recompute_connection_status()

    def _collect_event_logs(self) -> list[AttributeEventLog]:
        return [
            entry
            for attr in self.attributes.values()
            if attr.kind != AttributeKind.INTERNAL
            for entry in attr.all_log_entries()
            if entry.event_type in (EventType.READ, EventType.LISTEN)
        ]

    def _recompute_connection_status(self) -> None:
        cs_attr = self.get_attribute(CONNECTION_STATUS_ATTR)
        status = compute_connection_status(self._collect_event_logs())
        self._update_attribute(cs_attr, status)

    def _set_watchdog_status(self, status: ConnectionStatus) -> None:
        with contextlib.suppress(Exception):
            cs_attr = self.get_attribute(CONNECTION_STATUS_ATTR)
            self._update_attribute(cs_attr, status)

    async def _read_all_attributes(
        self,
    ) -> AsyncIterator[tuple[str, AttributeValueType | None]]:
        """Read every readable, non-internal attribute in turn, yielding
        ``(name, value)`` as each one lands.

        The transport must already be open. A failed read is logged and yields
        ``None`` for that attribute so a single unreachable register never aborts
        the whole sweep.

        A single ``correlation_id`` is minted for the sweep so attributes that
        render to the same transport address share one network read.
        """
        correlation_id = gen_id()
        for attr_name, attr in self.attributes.items():
            if "read" not in attr.read_write_modes:
                continue
            if attr.kind == AttributeKind.INTERNAL:
                continue
            try:
                value = await self.read_attribute_value(
                    attr_name, correlation_id=correlation_id
                )
                logger.debug(
                    "[Device %s] Read attribute %s with value %s",
                    self.id,
                    attr_name,
                    value,
                )
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "[Device %s] failed to read attribute %s — %s: %s",
                    self.id,
                    attr_name,
                    type(e).__name__,
                    e,
                )
                value = None
            yield attr_name, value

    async def update_attributes(self) -> None:
        """Update all attributes at once."""
        async for _ in self._read_all_attributes():
            pass

    async def update_once(self) -> None:
        """Open transport, read all attributes, then close."""
        async with self.transport:
            await self.update_attributes()

    async def stream_read(
        self,
    ) -> AsyncIterator[tuple[str, AttributeValueType | None]]:
        """Open transport, read and yield each attribute as it lands, then close.

        Same attribute selection and error handling as :meth:`update_attributes`,
        but streams results so callers can render progress instead of waiting for
        the full sweep to finish.
        """
        async with self.transport:
            async for item in self._read_all_attributes():
                yield item

    async def _confirm_attribute_value(
        self,
        attribute_name: str,
        expected_value: AttributeValueType,
        confirm_timeout: float,
    ) -> None:
        """Confirm a write landed by racing push confirmation against active reads.

        Registers a waiter on the attribute so any path through _update_attribute
        (push listener or active read) can resolve confirmation immediately.
        A poll task runs in the background as a fallback for pull-only transports,
        with exponential backoff starting at 0.25s.
        """
        async with self.wait_for_attribute(
            attribute_name, lambda v: v == expected_value
        ) as confirmed:
            if self.get_attribute_value(attribute_name) == expected_value:
                return

            poll_task = asyncio.create_task(self._poll_attribute(attribute_name))
            try:
                await asyncio.wait_for(confirmed.wait(), confirm_timeout)
            except TimeoutError as e:
                actual = self.get_attribute_value(attribute_name)
                msg = (
                    f"Failed to confirm {attribute_name}, "
                    f"expected {expected_value} got {actual}"
                )
                raise ConfirmationError(msg) from e
            finally:
                poll_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await poll_task

    @log_event(EventType.WRITE)
    async def write_attribute_value(
        self,
        attribute_name: str,
        value: AttributeValueType,
        *,
        confirm: bool = True,
        confirm_timeout: float = DEFAULT_CONFIRM_TIMEOUT,
        _log_attribute: Attribute | None = None,
    ) -> Attribute:
        attribute = _log_attribute or self.get_attribute(attribute_name)
        if not self.can_write(attribute_name):
            msg = f"Attribute '{attribute_name}' is not writable on device '{self.id}'"
            raise PermissionError(msg)
        validated_value = attribute.ensure_type(value)
        attribute_driver = self.driver.attributes[attribute.name]
        codec = attribute_driver.codec
        if attribute_driver.write is None:
            msg = (
                f"Driver '{self.driver.metadata.id}' has no write address"
                " for attribute'{attribute_name}'"
            )
            raise PermissionError(msg)
        encoded_value = codec.encode(value)
        context = {**self.driver.env, **self.config, "value": encoded_value}
        address = self.transport.build_address(
            render_struct(attribute_driver.write, context), context
        )
        await self.transport.write(address, encoded_value)
        logger.info(
            "Wrote attribute '%s' with value '%s' to device '%s'",
            attribute_name,
            validated_value,
            self.id,
        )
        if confirm:
            await self._confirm_attribute_value(
                attribute_name, validated_value, confirm_timeout
            )
        self._update_attribute(attribute, validated_value)
        return attribute

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, CoreDevice):
            return NotImplemented
        return (
            (self.transport.id == other.transport.id)
            & (self.driver.metadata.id == other.driver.metadata.id)
            & (self.config == other.config)
        )

    def __hash__(self) -> int:
        return hash((self.transport.id, self.driver.metadata.id, self.config))
