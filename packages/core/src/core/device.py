import logging
from dataclasses import dataclass

from core.types import AttributeValueType, DeviceConfig

from .attribute import Attribute
from .driver import Driver

logger = logging.getLogger(__name__)


@dataclass
class Device:
    id: str
    config: DeviceConfig
    driver: Driver
    attributes: dict[str, Attribute]

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

    def __post_init__(self) -> None:
        """Upon init, attach attribute updaters to the transport."""
        for attribute in self.attributes.values():

            def updater(new_value: AttributeValueType, attribute=attribute) -> None:  # noqa: ANN001
                return attribute.update_value(new_value)

            self.driver.attach_updater(attribute.name, self.config, updater)

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
    ) -> AttributeValueType | None:
        attribute = self.get_attribute(attribute_name)
        new_value = await self.driver.read_value(attribute_name, self.config)
        attribute.update_value(new_value)
        return attribute.current_value

    async def update_attributes(self) -> None:
        """Update all attributes at once."""
        for attr_name, attr in self.attributes.items():
            if "read" not in attr.read_write_modes:
                continue
            try:
                value = await self.read_attribute_value(attr_name)
                logger.info(
                    '[Device %s] read attribute "%s"= %s',
                    self.id,
                    attr_name,
                    value,
                )
            except Exception as e:
                logger.exception(
                    "[Device %s] failed to read attribute %s",
                    self.id,
                    attr_name,
                    exc_info=e,
                )

    async def write_attribute_value(
        self,
        attribute_name: str,
        value: AttributeValueType,
    ) -> AttributeValueType:
        attribute = self.get_attribute(attribute_name)
        if "write" not in attribute.read_write_modes:
            msg = f"Attribute '{attribute_name}' is not writable on device '{self.id}'"
            raise PermissionError(msg)
        validated_value = attribute.ensure_type(value)
        await self.driver.write_value(attribute_name, self.config, validated_value)
        attribute.update_value(validated_value)
        return attribute.current_value
