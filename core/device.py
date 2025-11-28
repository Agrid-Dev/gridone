from dataclasses import dataclass

from core.types import AttributeValueType, DeviceConfig

from .attribute import Attribute
from .driver import Driver


@dataclass
class Device:
    id: str
    config: DeviceConfig
    driver: Driver
    attributes: dict[str, Attribute]

    @classmethod
    def from_driver(cls, driver: Driver, config: DeviceConfig) -> "Device":
        return cls(
            id="my-device",  # TODO build ids  # noqa: FIX002, TD002, TD003, TD004
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
