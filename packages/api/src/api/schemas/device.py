from typing import Any, Dict

from core.attribute import Attribute
from core.device import Device as CoreDevice
from core.types import AttributeValueType
from pydantic import BaseModel


class DeviceBase(BaseModel):
    id: str
    config: Dict[str, Any]
    attributes: Dict[str, Attribute]
    driver: str

    @classmethod
    def from_core(cls, device: "CoreDevice") -> "DeviceBase":
        return cls(
            id=device.id,
            config=device.config,
            attributes=device.attributes,
            driver=device.driver.metadata.id,
        )


class AttributeUpdate(BaseModel):
    value: AttributeValueType
