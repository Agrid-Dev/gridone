import asyncio
import inspect
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from core.transports import PushTransportClient
from core.types import AttributeValueType, DeviceConfig

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
    attributes: dict[str, Attribute]
    _update_listeners: set[AttributeListener] = field(
        default_factory=set, init=False, repr=False
    )
    _background_tasks: set[asyncio.Task[None]] = field(
        default_factory=set, init=False, repr=False
    )

    @classmethod
    def from_driver(
        cls, driver: Driver, config: DeviceConfig, *, device_id: str
    ) -> "Device":
        return cls(
            id=device_id,
            driver=driver,
            config=config,
            attributes={
                a.name: Attribute.create(
                    a.name,
                    a.data_type,
                    {"read", "write"} if a.write is not None else {"read"},
                )
                for a in driver.schema.attribute_schemas
            },
        )

    async def init_listeners(self) -> None:
        """Upon init, attach attribute updaters to the transport."""
        if not isinstance(self.driver.transport, PushTransportClient):
            return
        for attribute in self.attributes.values():

            def updater(
                new_value: AttributeValueType | None, attribute: Attribute = attribute
            ) -> None:
                return self._update_attribute(attribute, new_value)

            await self.driver.attach_update_listener(
                attribute.name, self.config, updater
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
        new_value = await self.driver.read_value(attribute_name, self.config)
        self._update_attribute(attribute, new_value)
        return attribute.current_value

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
    ) -> None:
        attribute = self.get_attribute(attribute_name)
        if "write" not in attribute.read_write_modes:
            msg = f"Attribute '{attribute_name}' is not writable on device '{self.id}'"
            raise PermissionError(msg)
        validated_value = attribute.ensure_type(value)
        await self.driver.write_value(attribute_name, self.config, validated_value)
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
        attribute._update_value(new_value)  # noqa: SLF001
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
