from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from functools import partial
from typing import TYPE_CHECKING, Any

from devices_manager.core.driver import FaultAttributeDriver
from devices_manager.core.transports import PushTransportClient, ReadError
from devices_manager.core.utils.templating.render import render_struct
from devices_manager.observability.metrics import attribute_read
from models.errors import (
    ConfirmationError,
    InvalidError,
    NotFoundError,
    WriteRejectedError,
)
from models.ids import gen_id
from models.write_rules import WriteEvaluation, WriteReason

from .attribute import Attribute, AttributeKind, FaultAttribute
from .connection_status import ConnectionMonitor, EventType
from .connection_status_attribute import CONNECTION_STATUS_ATTR, build_cs_attribute
from .sweep_schedule import SweepSchedule, run_on_schedule
from .write_guard import WriteGuard

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


def _metadata_kwargs(attribute_driver: AttributeDriver) -> dict[str, Any]:
    """Presentation metadata and write constraints, projected verbatim from
    the driver onto the runtime attribute."""
    return {
        "label": attribute_driver.label,
        "description": attribute_driver.description,
        "user_confirmation": attribute_driver.user_confirmation,
        "group": attribute_driver.group,
        "unit": attribute_driver.unit,
        "value_labels": attribute_driver.value_labels,
        "write_constraints": attribute_driver.write_constraints,
        "default_value": attribute_driver.default_value,
    }


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
    resolution: dict[str, Any] = {}
    if restored is not None:
        current_value = restored.current_value
        last_updated = restored.last_updated
        last_changed = restored.last_changed
        resolution = {
            "raw_value": restored.raw_value,
            "resolution_error": restored.resolution_error,
        }
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
            **_metadata_kwargs(attribute_driver),
            **resolution,
        )
    return Attribute(
        name=attribute_driver.name,
        data_type=attribute_driver.data_type,
        read_write_modes=modes,
        current_value=current_value,
        last_updated=last_updated,
        last_changed=last_changed,
        value_options=attribute_driver.value_options,
        **_metadata_kwargs(attribute_driver),
        **resolution,
    )


def _decode_read_result(codec: FnCodec, result: ReadResult) -> AttributeValueType:
    """The decoded value of a sweep result; a failed read raises its error."""
    if isinstance(result, ReadError):
        raise result.error
    return codec.decode(result.value)


@dataclass(kw_only=True)
class CoreDevice:
    id: str
    name: str
    attributes: dict[str, Attribute]
    driver: Driver
    transport: TransportClient
    config: DeviceConfig
    type: str | None = field(init=False, default=None)
    tags: dict[str, list[str]] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    on_update: AttributeListener | None = field(default=None, repr=False)
    connection_monitor: ConnectionMonitor = field(init=False, repr=False)
    _syncing: bool = field(init=False, default=False, repr=False)
    _waiters: list[tuple[str, Callable[[AttributeValueType], bool], asyncio.Event]] = (
        field(init=False, default_factory=list, repr=False)
    )
    _poll_tasks: dict[str | None, asyncio.Task[None]] = field(
        init=False, default_factory=dict, repr=False
    )
    _guard: WriteGuard = field(init=False, repr=False)
    _write_lock: asyncio.Lock = field(
        init=False, default_factory=asyncio.Lock, repr=False
    )
    on_write_state_update: Callable[[CoreDevice], None] | None = field(
        default=None, repr=False
    )

    def __post_init__(self) -> None:
        if self.driver.transport != self.transport.protocol:
            msg = (
                f"Protocol mismatch: cannot use {self.driver.transport} driver"
                f" with {self.transport.protocol} transport"
            )
            raise TypeError(msg)
        self.type = self.driver.type
        self.connection_monitor = self._new_connection_monitor()
        # Nothing is trusted yet: persisted or hand-built values are displayed,
        # never relied on for a write until observed through the transport.
        self._guard = WriteGuard(
            self.driver,
            self._current_value,
            self._raw_code,
            on_expired=self._notify_write_state,
        )

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

    def rebuild_attribute(self, attribute_name: str) -> None:
        """Add or rebuild a single runtime attribute from its spec on the driver.

        The driver is user-authored data the registry has already updated;
        the device only rebuilds its own runtime state from it. Preserves the
        attribute's current_value and timestamps so live telemetry and fault
        age are not lost; a new attribute (no prior value) starts at None.
        """
        attribute_driver = self.driver.attributes[attribute_name]
        existing = self.attributes.get(attribute_name)
        self.attributes[attribute_name] = _build_attribute(
            attribute_driver, None, restored=existing
        )
        self._guard.rebind(self.driver)
        self._guard.forget(attribute_name)
        self._notify_write_state()

    def delete_attribute(self, attribute_name: str) -> None:
        """Delete a runtime attribute that no longer exists on the driver."""
        self.attributes.pop(attribute_name, None)
        self._guard.rebind(self.driver)
        self._guard.forget(attribute_name)
        self.connection_monitor.forget(attribute_name)
        self._notify_write_state()

    def rename_attribute(self, old_name: str, new_name: str) -> None:
        """Rename a runtime attribute in place, preserving all of its state."""
        existing = self.attributes.pop(old_name, None)
        if existing is not None:
            self.attributes[new_name] = existing.model_copy(update={"name": new_name})
        self._guard.rename(old_name, new_name)
        self.connection_monitor.rename(old_name, new_name)
        self._notify_write_state()

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
        restored = (
            restored_attributes if restored_attributes is not None else base.attributes
        )
        device = cls(
            id=base.id,
            name=base.name,
            config=base.config,
            tags=dict(base.tags),
            created_at=base.created_at,
            updated_at=base.updated_at,
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

        for name, value in initial.items():
            if name in device.driver.attributes and value is not None:
                device._ingest_attribute(name, value)
        return device

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
            if self.transport.push_is_opt_in and not attribute_driver.push:
                continue
            codec = attribute_driver.codec
            address = self.transport.build_address(
                render_struct(attribute_driver.read, context), context
            )
            await self.transport.register_listener(
                address, self._make_on_message(codec, attribute)
            )

    def _make_on_message(
        self, codec: FnCodec, attribute: Attribute
    ) -> Callable[[object], None]:
        def on_message(v: object) -> None:
            with self.connection_monitor.observe(EventType.LISTEN, attribute.name):
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

        return on_message

    async def start_sync(self, *, sweep_now: bool = False) -> None:
        """Start listeners, polling, and connection monitoring for this device.

        Each polling group sweeps on its own slots (see ``SweepSchedule``), so
        devices started together do not sweep together. ``sweep_now`` adds one
        immediate sweep per group, for a user acting on this one device; fleet
        restarts leave it off.

        Monitoring starts afresh, from the driver's current healthcheck.
        """
        self.connection_monitor.close()
        self.connection_monitor = self._new_connection_monitor()
        self.connection_monitor.watch()
        self._guard.watch(self.expected_interval)
        await self.init_listeners()
        for group_name, (interval, names) in self._polling_groups().items():
            task = self._poll_tasks.get(group_name)
            if task is None or task.done():
                self._poll_tasks[group_name] = asyncio.create_task(
                    run_on_schedule(
                        SweepSchedule.for_group(self.id, group_name, interval),
                        partial(self._sweep, names),
                        sweep_now=sweep_now,
                    )
                )
        self._syncing = True

    async def stop_sync(self) -> None:
        """Cancel polling, stop silence detection, and mark as not syncing."""
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
        self.connection_monitor.close()
        self._guard.close()
        self._syncing = False
        self._notify_write_state()

    def _polling_groups(self) -> dict[str | None, tuple[float, list[str]]]:
        """Bucket readable, non-internal attributes by polling group.

        Attributes with no `polling_group` fall into an implicit ``None``
        bucket, polled at the driver's `polling_interval` — and only while
        polling is enabled. Named groups always poll: an attribute assigned
        to one has opted in explicitly, so ``polling: disable`` reads as
        "no polling by default" rather than "no polling at all". That is how
        a push-fed device gets a single trigger attribute polled while its
        siblings stay listen-only.
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
            elif self.polling_enabled and default_interval is not None:
                result[group_name] = (default_interval, names)
        return result

    async def _sweep(self, attribute_names: list[str]) -> None:
        """One scheduled sweep; an unexpected failure is logged so the group
        keeps polling on its next slot."""
        try:
            await self._read_group(attribute_names)
        except Exception:
            logger.exception("[Device %s] polling sweep failed", self.id)

    async def _read_group(self, attribute_names: list[str]) -> None:
        """One polling-group sweep: a single ``read_many`` call sharing one
        ``sweep_id``, with each result applied as it streams in.

        Building one attribute's address must never abort the sweep for its
        siblings, so failures here are isolated per attribute — mirroring how
        ``read_many`` already isolates failures per network read.
        """
        sweep_id = gen_id()
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
        async for result in self.transport.read_many(addresses, sweep_id):
            for attr_name in attr_names_by_address_id.get(result.address_id, []):
                self._apply_read_result(attr_name, result)

    def _apply_read_result(self, attr_name: str, result: ReadResult) -> None:
        attribute = self.attributes.get(attr_name)
        attribute_driver = self.driver.attributes.get(attr_name)
        if attribute is None or attribute_driver is None:
            return
        try:
            with self._observe_read(attr_name):
                decoded_value = _decode_read_result(attribute_driver.codec, result)
        except Exception as e:  # noqa: BLE001
            failure = (
                "poll read failed for"
                if isinstance(result, ReadError)
                else "failed to decode attribute"
            )
            logger.warning(
                "[Device %s] %s %s — %s: %s",
                self.id,
                failure,
                attr_name,
                type(e).__name__,
                e,
            )
            return
        try:
            self._ingest_attribute(attribute.name, decoded_value)
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "[Device %s] on_update listener failed for %s — %s: %s",
                self.id,
                attr_name,
                type(e).__name__,
                e,
            )

    @contextlib.contextmanager
    def _observe_read(self, attribute_name: str) -> Iterator[None]:
        """Record the outcome of a read, decode included, in the connection
        monitor and the ``device.attribute.read`` metric. Shared by single
        reads and polling sweeps."""
        try:
            with self.connection_monitor.observe(EventType.READ, attribute_name):
                yield
        except Exception:
            self._guard.forget(attribute_name)
            self._notify_write_state()
            attribute_read.add(
                1, {"protocol": self.transport.protocol, "status": "error"}
            )
            raise
        attribute_read.add(1, {"protocol": self.transport.protocol, "status": "ok"})

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

    def _current_value(self, attribute_name: str) -> AttributeValueType | None:
        """The displayed value of an attribute; ``None`` when this device has none."""
        attribute = self.attributes.get(attribute_name)
        return None if attribute is None else attribute.current_value

    def _raw_code(self, attribute_name: str) -> AttributeValueType | None:
        """The saved wire code of a value-mapped attribute, for reinterpretation."""
        attribute = self.attributes.get(attribute_name)
        return None if attribute is None else attribute.raw_value

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
        *,
        observed: bool = True,
    ) -> None:
        if observed and attribute.name in self.driver.attributes:
            self._ingest_attribute(attribute.name, new_value)
            return
        self._publish_value(attribute, new_value, observation=observed)

    def _publish_value(
        self,
        attribute: Attribute,
        value: AttributeValueType | None,
        *,
        observation: bool,
    ) -> None:
        """Store a value and tell listeners; only an observation confirms a write.

        A value-mapped attribute reinterpreted from its saved code after a
        sibling changed is displayed, but it is no evidence that a pending
        write reached the device, so waiters only see observations.
        """
        # Compared here so Attribute stays unaware of the listener contract.
        previous_value = attribute.current_value
        previous = attribute.model_copy() if previous_value is not None else None
        attribute.update_value(value)  # ty:ignore[invalid-argument-type]
        if observation and value is not None:
            for wname, pred, event in self._waiters:
                if wname == attribute.name and pred(value):
                    event.set()
        if self.on_update and attribute.current_value != previous_value:
            self.on_update(self, attribute.name, previous, attribute)

    async def read_attribute_value(
        self,
        attribute_name: str,
        *,
        sweep_id: str | None = None,
    ) -> AttributeValueType:
        attribute = self.get_attribute(attribute_name)
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
        with self._observe_read(attribute.name):
            raw_value = await self.transport.read(address, sweep_id)
            self._update_attribute(attribute, attribute_driver.codec.decode(raw_value))
        return attribute.current_value  # ty:ignore[invalid-return-type]

    def _new_connection_monitor(self) -> ConnectionMonitor:
        return ConnectionMonitor(
            self._publish_connection_status,
            silence_interval=self.expected_interval,
            max_attribute_loss=self.driver.healthcheck.max_attribute_loss,
        )

    def _publish_connection_status(self, status: ConnectionStatus) -> None:
        self._update_attribute(self.attributes[CONNECTION_STATUS_ATTR], status)

    async def _read_all_attributes(
        self,
    ) -> AsyncIterator[tuple[str, AttributeValueType | None]]:
        """Read every readable, non-internal attribute in turn, yielding
        ``(name, value)`` as each one lands.

        The transport must already be open. A failed read is logged and yields
        ``None`` for that attribute so a single unreachable register never aborts
        the whole sweep.

        A single ``sweep_id`` is minted for the sweep so attributes that
        render to the same transport address share one network read.
        """
        sweep_id = gen_id()
        for attr_name, attr in self.attributes.items():
            if "read" not in attr.read_write_modes:
                continue
            if attr.kind == AttributeKind.INTERNAL:
                continue
            try:
                value = await self.read_attribute_value(attr_name, sweep_id=sweep_id)
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

    async def refresh_attribute(self, attribute_name: str) -> Attribute:
        """Force a fresh read of one attribute, on demand.

        Reads directly through the transport (auto-connecting via its
        ``@connected`` guard) rather than opening/closing it — the transport
        may be shared with other devices or polling groups still relying on
        it, and closing it here would disconnect them too.
        """
        try:
            await self.read_attribute_value(attribute_name)
        except Exception as e:
            logger.warning(
                "[Device %s] on-demand refresh failed for %s — %s: %s",
                self.id,
                attribute_name,
                type(e).__name__,
                e,
            )
            raise
        return self.get_attribute(attribute_name)

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
            if self._guard.known(attribute_name) == expected_value:
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

    @property
    def write_state_revision(self) -> int:
        return self._guard.revision

    def _ingest_attribute(self, name: str, sample: AttributeValueType | None) -> None:
        """Apply one acquired sample, then the mapped attributes it reinterprets."""
        spec = self.driver.attributes[name]
        if sample is not None and spec.value_mapping is None:
            sample = self.attributes[name].ensure_type(sample)
        for key, decoded in self._guard.observed(name, sample).items():
            attribute = self.attributes.get(key)
            if attribute is None:
                continue
            attribute.raw_value = decoded.code
            attribute.resolution_error = decoded.error
            self._publish_value(attribute, decoded.value, observation=key == name)
        self._notify_write_state()

    def rebind_driver(self) -> None:
        """Follow a committed change of the shared driver without touching it."""
        self._guard.rebind(self.driver)
        self._notify_write_state()

    def project_write_states(self) -> bool:
        """Publish the write states the guard recomputed; True if the revision moved."""
        before = self._guard.revision
        for name, state in self._guard.project().items():
            attribute = self.attributes.get(name)
            if attribute is not None:
                attribute.write_state = state
        return self._guard.revision != before

    def flush_write_states(self) -> bool:
        """Project once for this turn; True when an event is worth emitting."""
        self.project_write_states()
        return self._guard.announce()

    def _notify_write_state(self) -> None:
        """Tell the service the write states may have moved: O(1), coalesced there."""
        if self.on_write_state_update is not None:
            self.on_write_state_update(self)

    def evaluate_attribute_write(
        self, attribute_name: str, value: AttributeValueType
    ) -> WriteEvaluation:
        self.get_attribute(attribute_name)
        return self._guard.evaluate(attribute_name, value)

    def validate_attribute_write(
        self, attribute_name: str, value: AttributeValueType
    ) -> AttributeValueType:
        """The universal, side-effect-free guard, also used by the direct CLI."""
        self.get_attribute(attribute_name)
        return self._guard.check(attribute_name, value)

    async def write_attribute_value(
        self,
        attribute_name: str,
        value: AttributeValueType,
        *,
        confirm: bool = True,
        confirm_timeout: float = DEFAULT_CONFIRM_TIMEOUT,
    ) -> Attribute:
        """Check, encode and send under the write lock; confirm after releasing it.

        The lock keeps a concurrent write from moving the context between the
        check and the send. A context that moves while a confirmation waits
        is caught by the mapping comparison afterwards. A rejection is not a
        transport failure and leaves no write log; the requested value is
        never published as an observation.
        """
        attribute = self.get_attribute(attribute_name)
        async with self._write_lock:
            validated = self._guard.check(attribute_name, value)
            spec = self.driver.attributes[attribute_name]
            if spec.write is None:
                raise WriteRejectedError([WriteReason(code="not_writable")])
            context = self._guard.mapping_context(attribute_name)
            encoded = spec.codec.encode(self._guard.encode(attribute_name, validated))
            render = {**self.driver.env, **self.config, "value": encoded}
            address = self.transport.build_address(
                render_struct(spec.write, render), render
            )
            with self.connection_monitor.observe(EventType.WRITE, attribute_name):
                # Sending invalidates knowledge of the target until it is
                # observed again.
                self._guard.forget(attribute_name)
                self._notify_write_state()
                await self.transport.write(address, encoded)
        logger.info(
            "Wrote attribute '%s' with value '%s' to device '%s'",
            attribute_name,
            validated,
            self.id,
        )
        if confirm:
            await self._confirm_attribute_value(
                attribute_name, validated, confirm_timeout
            )
            if context != self._guard.mapping_context(attribute_name):
                raise WriteRejectedError([WriteReason(code="mapping_changed")])
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
