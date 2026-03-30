from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from devices_manager.types import AttributeValueType, DeviceKind

from .device_base import DeviceBase

if TYPE_CHECKING:
    from .attribute import Attribute

logger = logging.getLogger(__name__)


@dataclass(kw_only=True)
class VirtualDevice(DeviceBase):
    kind: DeviceKind = field(default=DeviceKind.VIRTUAL, init=False)

    def read_attribute_value(self, attribute_name: str) -> AttributeValueType | None:
        return self.get_attribute_value(attribute_name)

    async def write_attribute_value(
        self, attribute_name: str, value: AttributeValueType, *, confirm: bool = True
    ) -> Attribute:
        _ = confirm
        attribute = self.get_attribute(attribute_name)
        if "write" not in attribute.read_write_modes:
            msg = f"Attribute '{attribute_name}' is not writable on device '{self.id}'"
            raise PermissionError(msg)
        validated_value = attribute.ensure_type(value)
        self._update_attribute(attribute, validated_value)
        logger.info(
            "Wrote attribute '%s' with value '%s' to virtual device '%s'",
            attribute_name,
            validated_value,
            self.id,
        )
        return attribute
