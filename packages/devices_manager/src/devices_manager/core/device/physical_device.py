from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, ClassVar

from devices_manager.core.transports import PushTransportClient
from devices_manager.core.utils.templating.render import render_struct
from devices_manager.types import DeviceKind
from models.errors import ConfirmationError

from .attribute import Attribute
from .device import CoreDevice

if TYPE_CHECKING:
    from collections.abc import Callable

    from devices_manager.core.codecs import FnCodec
    from devices_manager.core.driver import Driver
    from devices_manager.core.transports import TransportClient
    from devices_manager.types import AttributeValueType, DeviceConfig

    from .device import AttributeUpdateCallback
    from .device_base import DeviceBase

logger = logging.getLogger(__name__)


@dataclass(kw_only=True)
class PhysicalDevice(CoreDevice):
    driver: Driver
    transport: TransportClient
    config: DeviceConfig
    kind: ClassVar[DeviceKind] = DeviceKind.PHYSICAL
    type: str | None = field(init=False, default=None)
    _poll_task: asyncio.Task[None] | None = field(init=False, default=None, repr=False)

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

    @classmethod
    def from_base(
        cls,
        base: DeviceBase,
        *,
        transport: TransportClient,
        driver: Driver,
        initial_values: dict[str, AttributeValueType] | None = None,
        on_update: AttributeUpdateCallback | None = None,
    ) -> PhysicalDevice:
        return cls(
            id=base.id,
            name=base.name,
            config=base.config,
            driver=driver,
            transport=transport,
            on_update=on_update,
            attributes={
                a.name: Attribute.create(
                    a.name,
                    a.data_type,
                    {"read", "write"} if a.write is not None else {"read"},
                    (initial_values or {}).get(a.name),
                )
                for a in driver.attributes.values()
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
            decoded = codec.decode(v)
            logger.debug(
                "Attribute %s of device %s updated to value %s by listener",
                attribute.name,
                self.id,
                decoded,
            )
            self._update_attribute(attribute, decoded)

        return on_message

    async def start_sync(self) -> None:
        """Start listeners and polling for this device."""
        await self.init_listeners()
        if self.polling_enabled and (self._poll_task is None or self._poll_task.done()):
            self._poll_task = asyncio.create_task(self._poll_loop())
        self._syncing = True

    async def stop_sync(self) -> None:
        """Cancel polling and mark as not syncing."""
        if self._poll_task is not None and not self._poll_task.done():
            self._poll_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._poll_task
        self._poll_task = None
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

    async def read_attribute_value(
        self,
        attribute_name: str,
    ) -> AttributeValueType:
        attribute = self.get_attribute(attribute_name)
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

    async def update_attributes(self) -> None:
        """Update all attributes at once."""
        for attr_name, attr in self.attributes.items():
            if "read" not in attr.read_write_modes:
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
        max_retries: int = 3,
    ) -> None:
        actual_value = self.get_attribute_value(attribute_name)
        if actual_value == expected_value:
            return
        confirm_delay = 0.25
        for _ in range(max_retries):
            try:
                await asyncio.sleep(confirm_delay)
                actual_value = await self.read_attribute_value(attribute_name)
                if actual_value == expected_value:
                    return
                confirm_delay *= 4
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "[Device %s] failed to read attribute %s — %s: %s",
                    self.id,
                    attribute_name,
                    type(e).__name__,
                    e,
                )
        msg = (
            f"Failed to confirm attribute {attribute_name} value, "
            f"expected {expected_value} got {actual_value}"
        )
        raise ConfirmationError(msg)

    async def write_attribute_value(
        self, attribute_name: str, value: AttributeValueType, *, confirm: bool = True
    ) -> Attribute:
        attribute = self.get_attribute(attribute_name)
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
        if confirm and attribute_driver.confirm:
            await self._confirm_attribute_value(attribute_name, validated_value)
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
