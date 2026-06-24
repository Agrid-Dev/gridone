from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, ClassVar

from devices_manager.core.driver import FaultAttributeDriver
from devices_manager.core.transports import PushTransportClient
from devices_manager.core.utils.templating.render import render_struct
from devices_manager.types import ConnectionStatus, DeviceKind, ReadWriteMode
from models.errors import ConfirmationError, InvalidError

from .attribute import Attribute, AttributeKind, FaultAttribute
from .connection_status import (
    CONNECTION_STATUS_ATTR,
    build_cs_attribute,
    compute_connection_status,
)
from .device import DEFAULT_CONFIRM_TIMEOUT, CoreDevice
from .event_log import EventType, log_event, wrap_listen
from .watchdog import SilenceWatchdog

if TYPE_CHECKING:
    from collections.abc import Callable

    from devices_manager.core.codecs import FnCodec
    from devices_manager.core.driver import AttributeDriver, Driver
    from devices_manager.core.transports import TransportClient
    from devices_manager.types import AttributeValueType, DeviceConfig

    from .device import AttributeListener
    from .device_base import DeviceBase
    from .event_log import AttributeEventLog

logger = logging.getLogger(__name__)


def _build_attribute(
    attribute_driver: AttributeDriver,
    initial_value: AttributeValueType | None,
) -> Attribute:
    """Construct the runtime Attribute that matches the driver's kind.

    FaultAttributeDriver → FaultAttribute (carries healthy_values +
    severity so the is_faulty computed property has what it needs).
    """
    modes: set[ReadWriteMode] = (
        {"read", "write"} if attribute_driver.write is not None else {"read"}
    )
    now = datetime.now(UTC) if initial_value is not None else None
    if isinstance(attribute_driver, FaultAttributeDriver):
        return FaultAttribute(
            name=attribute_driver.name,
            data_type=attribute_driver.data_type,
            read_write_modes=modes,
            current_value=initial_value,
            last_updated=now,
            last_changed=now,
            healthy_values=attribute_driver.healthy_values,
            severity=attribute_driver.severity,
        )
    return Attribute.create(
        attribute_driver.name,
        attribute_driver.data_type,
        modes,
        initial_value,
        value_options=attribute_driver.value_options,
    )


@dataclass(kw_only=True)
class PhysicalDevice(CoreDevice):
    driver: Driver
    transport: TransportClient
    config: DeviceConfig
    kind: ClassVar[DeviceKind] = DeviceKind.PHYSICAL
    type: str | None = field(init=False, default=None)
    _poll_task: asyncio.Task[None] | None = field(init=False, default=None, repr=False)
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
        push_interval = self.driver.update_strategy.expected_push_interval
        return float(push_interval) if push_interval is not None else None

    @classmethod
    def from_base(
        cls,
        base: DeviceBase,
        *,
        transport: TransportClient,
        driver: Driver,
        initial_values: dict[str, AttributeValueType] | None = None,
        on_update: AttributeListener | None = None,
    ) -> PhysicalDevice:
        initial = initial_values or {}
        return cls(
            id=base.id,
            name=base.name,
            config=base.config,
            driver=driver,
            transport=transport,
            on_update=on_update,
            attributes={
                **{
                    a.name: _build_attribute(a, initial.get(a.name))
                    for a in driver.attributes.values()
                },
                CONNECTION_STATUS_ATTR: build_cs_attribute(
                    initial.get(CONNECTION_STATUS_ATTR)  # type: ignore[arg-type]
                ),
            },
        )

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
        if self.polling_enabled and (self._poll_task is None or self._poll_task.done()):
            self._poll_task = asyncio.create_task(self._poll_loop())
        interval = self.expected_interval
        if interval is not None:
            self._watchdog = SilenceWatchdog(interval, self._set_watchdog_status)
            await self._watchdog.start()
        self._syncing = True

    async def stop_sync(self) -> None:
        """Cancel polling, watchdog, and mark as not syncing."""
        if self._poll_task is not None and not self._poll_task.done():
            self._poll_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._poll_task
        self._poll_task = None
        if self._watchdog is not None:
            await self._watchdog.stop()
            self._watchdog = None
        self._syncing = False

    async def _poll_loop(self) -> None:
        interval = self.poll_interval
        if interval is None:
            return
        try:
            while True:
                await self.update_attributes()
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            return

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

    @log_event(EventType.READ)
    async def read_attribute_value(
        self,
        attribute_name: str,
        *,
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
        raw_value = await self.transport.read(address)
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

    async def update_attributes(self) -> None:
        """Update all attributes at once."""
        for attr_name, attr in self.attributes.items():
            if "read" not in attr.read_write_modes:
                continue
            if attr.kind == AttributeKind.INTERNAL:
                continue
            try:
                value = await self.read_attribute_value(attr_name)
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

    async def update_once(self) -> None:
        """Open transport, read all attributes, then close."""
        async with self.transport:
            await self.update_attributes()

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
        if not isinstance(other, PhysicalDevice):
            return NotImplemented
        return (
            (self.transport.id == other.transport.id)
            & (self.driver.metadata.id == other.driver.metadata.id)
            & (self.config == other.config)
        )

    def __hash__(self) -> int:
        return hash((self.transport.id, self.driver.metadata.id, self.config))
