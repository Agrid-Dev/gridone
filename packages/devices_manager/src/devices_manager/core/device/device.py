from __future__ import annotations

import logging
import uuid
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, ClassVar

from .attribute import Attribute

if TYPE_CHECKING:
    from devices_manager.types import AttributeValueType, DataType, DeviceKind

logger = logging.getLogger(__name__)

AttributeUpdateCallback = Callable[["CoreDevice", str, Attribute], None]


@dataclass(kw_only=True)
class CoreDevice(ABC):
    id: str
    name: str
    attributes: dict[str, Attribute]
    kind: ClassVar[DeviceKind]
    type: str | None = None
    on_update: AttributeUpdateCallback | None = field(default=None, repr=False)
    _syncing: bool = field(init=False, default=False, repr=False)

    @property
    def syncing(self) -> bool:
        """Whether this device is actively synchronizing."""
        return self._syncing

    @property
    def driver_id(self) -> str | None:
        return None

    @property
    def transport_id(self) -> str | None:
        return None

    @property
    def polling_enabled(self) -> bool:
        return False

    @property
    def poll_interval(self) -> float | None:
        return None

    @abstractmethod
    async def start_sync(self) -> None:
        """Start synchronizing this device (listeners + polling)."""

    @abstractmethod
    async def stop_sync(self) -> None:
        """Stop synchronizing this device."""

    async def init_listeners(self) -> None:  # noqa: B027
        """Attach transport listeners. No-op for non-physical devices."""

    async def update_attributes(self) -> None:  # noqa: B027
        """Pull fresh values for all attributes. No-op for non-physical devices."""

    async def update_once(self) -> None:  # noqa: B027
        """Open transport, read all attributes, close. No-op for non-physical."""

    def get_attribute(self, attribute_name: str) -> Attribute:
        try:
            return self.attributes[attribute_name]
        except KeyError as ke:
            msg = f"Attribute '{attribute_name}' not found in device '{self.id}'"
            raise KeyError(msg) from ke

    def get_attribute_value(self, attribute_name: str) -> AttributeValueType | None:
        return self.get_attribute(attribute_name).current_value

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
    ) -> None:
        attribute._update_value(new_value)  # noqa: SLF001  # ty:ignore[invalid-argument-type]
        if self.on_update:
            self.on_update(self, attribute.name, attribute)

    @abstractmethod
    async def read_attribute_value(
        self, attribute_name: str
    ) -> AttributeValueType | None:
        """Read the current value of an attribute."""

    @abstractmethod
    async def write_attribute_value(
        self,
        attribute_name: str,
        value: AttributeValueType,
        *,
        confirm: bool = True,
    ) -> Attribute:
        """Write a value to an attribute."""

    @staticmethod
    def gen_id() -> str:
        """Generate an id for a new device."""
        return str(uuid.uuid4())[:8]
