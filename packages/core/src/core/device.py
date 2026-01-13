import asyncio
import inspect
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from core.transports import PushTransportClient, TransportClient
from core.types import AttributeValueType, DeviceConfig
from core.utils.templating.render import render_struct

from .attribute import Attribute
from .driver import Driver

logger = logging.getLogger(__name__)

AttributeListener = Callable[["Device", str, Attribute], Awaitable[None] | None]


class ConfirmationError(ValueError):
    pass


@dataclass
class Device:
    id: str
    config: DeviceConfig
    driver: Driver
    transport: TransportClient
    attributes: dict[str, Attribute]
    _update_listeners: set[AttributeListener] = field(
        default_factory=set, init=False, repr=False
    )
    _background_tasks: set[asyncio.Task[None]] = field(
        default_factory=set, init=False, repr=False
    )

    def __post_init__(self) -> None:
        if self.driver.transport != self.transport.protocol:
            msg = (
                f"Protocol mismatch: cannot use {self.driver.transport} driver"
                f" with {self.transport.protocol} transport"
            )
            raise TypeError(msg)

    @classmethod
    def from_driver(
        cls,
        driver: Driver,
        transport: TransportClient,
        config: DeviceConfig,
        *,
        device_id: str,
    ) -> "Device":
        return cls(
            id=device_id,
            driver=driver,
            transport=transport,
            config=config,
            attributes={
                a.name: Attribute.create(
                    a.name,
                    a.data_type,
                    {"read", "write"} if a.write is not None else {"read"},
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

            adapter = attribute_driver.value_adapter

            def updater(
                new_value: AttributeValueType | None, attribute: Attribute = attribute
            ) -> None:
                return self._update_attribute(attribute, new_value)

            address = self.transport.build_address(
                render_struct(attribute_driver.read, context), context
            )
            await self.transport.register_listener(
                address.topic,
                lambda v: updater(adapter.decode(v)),  # noqa: B023
            )

    def get_attribute(self, attribute_name: str) -> Attribute:
        try:
            return self.attributes[attribute_name]
        except KeyError as ke:
            msg = f"Attribute '{attribute_name}' not found in device '{self.id}'"
            raise KeyError(msg) from ke

    def get_attribute_value(self, attribute_name: str) -> AttributeValueType | None:
        return self.get_attribute(attribute_name).current_value

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
        adapter = attribute_driver.value_adapter
        decoded_value = adapter.decode(raw_value)
        self._update_attribute(attribute, decoded_value)
        return attribute.current_value  # ty:ignore[invalid-return-type]

    async def update_attributes(self) -> None:
        """Update all attributes at once."""
        for attr_name, attr in self.attributes.items():
            if "read" not in attr.read_write_modes:
                continue
            try:
                await self.read_attribute_value(attr_name)
            except Exception as e:
                logger.exception(
                    "[Device %s] failed to read attribute %s",
                    self.id,
                    attr_name,
                    exc_info=e,
                )

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
            except Exception as e:
                logger.exception(
                    "[Device %s] failed to read attribute %s",
                    self.id,
                    attribute_name,
                    exc_info=e,
                )
        msg = (
            f"Failed to confirm attribute {attribute_name} value, "
            f"expected {expected_value} got {actual_value}"
        )
        raise ConfirmationError(msg)

    async def write_attribute_value(
        self, attribute_name: str, value: AttributeValueType, *, confirm: bool = True
    ) -> AttributeValueType | None:
        attribute = self.get_attribute(attribute_name)
        if "write" not in attribute.read_write_modes:
            msg = f"Attribute '{attribute_name}' is not writable on device '{self.id}'"
            raise PermissionError(msg)
        validated_value = attribute.ensure_type(value)
        context = {**self.driver.env, **self.config, "value": value}
        attribute_driver = self.driver.attributes[attribute.name]
        adapter = attribute_driver.value_adapter
        if attribute_driver.write is None:
            msg = (
                f"Driver '{self.driver.metadata.id}' has no write address"
                " for attribute'{attribute_name}'"
            )
            raise PermissionError(msg)
        address = self.transport.build_address(
            render_struct(attribute_driver.write, context), context
        )
        encoded_value = adapter.encode(value)
        await self.transport.write(address, encoded_value)
        logger.info(
            "Wrote attribute '%s' with value '%s' to device '%s'",
            attribute_name,
            validated_value,
            self.id,
        )
        if confirm:
            await self._confirm_attribute_value(attribute_name, validated_value)
        self._update_attribute(attribute, validated_value)
        return attribute.current_value

    def add_update_listener(
        self,
        callback: AttributeListener,
    ) -> None:
        self._update_listeners.add(callback)

    def _update_attribute(
        self,
        attribute: Attribute,
        new_value: AttributeValueType | None,
    ) -> None:
        attribute._update_value(new_value)  # noqa: SLF001  # ty:ignore[invalid-argument-type]
        self._execute_update_listeners(attribute.name, attribute)

    def _execute_update_listeners(
        self, attribute_name: str, attribute: Attribute
    ) -> None:
        for callback in self._update_listeners:
            try:
                result = callback(self, attribute_name, attribute)
                if inspect.isawaitable(result):
                    task = asyncio.create_task(result)
                    self._background_tasks.add(task)
                    task.add_done_callback(self._background_tasks.discard)
            except Exception:
                logger.exception(
                    "Device listener failed for %s.%s", self.id, attribute_name
                )
