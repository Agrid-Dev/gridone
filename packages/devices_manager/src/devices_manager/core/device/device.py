from __future__ import annotations

import asyncio
import logging
import uuid
from abc import ABC, abstractmethod
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, ClassVar

from .attribute import Attribute

if TYPE_CHECKING:
    from devices_manager.types import AttributeValueType, DeviceKind

logger = logging.getLogger(__name__)

AttributeListener = Callable[
    ["Device", str, Attribute], Coroutine[Any, Any, None] | None
]


@dataclass(kw_only=True)
class Device(ABC):
    id: str
    name: str
    attributes: dict[str, Attribute]
    kind: ClassVar[DeviceKind]
    type: str | None = None
    _update_listeners: set[AttributeListener] = field(
        default_factory=set, init=False, repr=False
    )
    _background_tasks: set[asyncio.Task[None]] = field(
        default_factory=set, init=False, repr=False
    )

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

    async def init_listeners(self) -> None:  # noqa: B027
        """Attach transport listeners. No-op for non-physical devices."""

    async def update_attributes(self) -> None:  # noqa: B027
        """Pull fresh values for all attributes. No-op for non-physical devices."""

    async def update_once(self) -> None:  # noqa: B027
        """Open transport, read all attributes, close. No-op for non-physical."""

    def bulk_update_attributes(
        self, values: dict[str, AttributeValueType]
    ) -> dict[str, Attribute]:
        """Bulk-update multiple attribute values atomically. Virtual devices only."""
        msg = f"Bulk state update is not supported on {self.kind} devices"
        raise NotImplementedError(msg)

    def get_attribute(self, attribute_name: str) -> Attribute:
        try:
            return self.attributes[attribute_name]
        except KeyError as ke:
            msg = f"Attribute '{attribute_name}' not found in device '{self.id}'"
            raise KeyError(msg) from ke

    def get_attribute_value(self, attribute_name: str) -> AttributeValueType | None:
        return self.get_attribute(attribute_name).current_value

    def add_update_listener(self, callback: AttributeListener) -> None:
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
                if isinstance(result, Coroutine):
                    task = asyncio.create_task(result)
                    self._background_tasks.add(task)
                    task.add_done_callback(self._background_tasks.discard)
            except Exception:
                logger.exception(
                    "Device listener failed for %s.%s", self.id, attribute_name
                )

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
