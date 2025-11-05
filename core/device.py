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
        # TODO build ids
        return cls(
            id="my-device",
            driver=driver,
            config=config,
            attributes={
                a.attribute_name: Attribute.create(
                    a.attribute_name,
                    a.data_type,
                    {"read"},
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

    def get_attribute_value(self, attribute_name: str) -> AttributeValueType:
        return self.get_attribute(attribute_name).current_value

    # async def read_attribute_value(self, attribute_name: str) -> AttributeValueType:
    #     new_value = self.driver.
    #     return await self.driver.read_attribute(self, attribute_name)
