from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from .attribute import Attribute

if TYPE_CHECKING:
    from devices_manager.types import AttributeValueType, DeviceKind

logger = logging.getLogger(__name__)

AttributeListener = Callable[
    ["DeviceBase", str, Attribute], Coroutine[Any, Any, None] | None
]


@dataclass(kw_only=True)
class DeviceBase:
    id: str
    name: str
    kind: DeviceKind
    attributes: dict[str, Attribute]
    type: str | None = None
    _update_listeners: set[AttributeListener] = field(
        default_factory=set, init=False, repr=False
    )
    _background_tasks: set[asyncio.Task[None]] = field(
        default_factory=set, init=False, repr=False
    )

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

    async def write_attribute_value(
        self,
        attribute_name: str,
        value: AttributeValueType,
        *,
        confirm: bool = True,
    ) -> Attribute:
        raise NotImplementedError

    @staticmethod
    def gen_id() -> str:
        """Generate an id for a new device."""
        return str(uuid.uuid4())[:8]
