from __future__ import annotations

import asyncio
import contextlib
import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, ClassVar

from models.errors import NotFoundError

from .attribute import Attribute, FaultAttribute

if TYPE_CHECKING:
    from devices_manager.core.driver.attribute_driver import AttributeDriver
    from devices_manager.types import AttributeValueType, DataType, DeviceKind

logger = logging.getLogger(__name__)

DEFAULT_CONFIRM_TIMEOUT: float = 5.0

# (device, attribute_name, previous, new). `previous` is `None` for the first
# event ever observed for this attribute (i.e. its `current_value` was `None`
# before the mutation); otherwise it's an immutable snapshot of the attribute's
# state before the value changed. On the first post-restart event `previous`
# reflects the persisted state, not `None`. Listeners can compare `previous`
# and `new` to detect transitions without maintaining per-listener state.
AttributeListener = Callable[
    ["CoreDevice", str, "Attribute | None", Attribute],
    Awaitable[None] | None,
]


@dataclass(kw_only=True)
class CoreDevice(ABC):
    id: str
    name: str
    attributes: dict[str, Attribute]
    kind: ClassVar[DeviceKind]
    type: str | None = None
    tags: dict[str, str] = field(default_factory=dict)
    on_update: AttributeListener | None = field(default=None, repr=False)
    _syncing: bool = field(init=False, default=False, repr=False)
    _waiters: list[tuple[str, Callable[[AttributeValueType], bool], asyncio.Event]] = (
        field(init=False, default_factory=list, repr=False)
    )

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
    def is_faulty(self) -> bool:
        return any(
            isinstance(a, FaultAttribute) and a.is_faulty
            for a in self.attributes.values()
        )

    @property
    def poll_interval(self) -> float | None:
        return None

    @abstractmethod
    async def start_sync(self) -> None:
        """Start synchronizing this device (listeners + polling)."""

    @abstractmethod
    async def stop_sync(self) -> None:
        """Stop synchronizing this device."""

    @contextlib.asynccontextmanager
    async def wait_for_attribute(
        self,
        name: str,
        predicate: Callable[[AttributeValueType], bool],
    ) -> AsyncIterator[asyncio.Event]:
        """Async context manager that yields an Event set when predicate matches.

        Both push listeners and active reads go through _update_attribute, so
        any update path naturally triggers confirmation without special-casing.
        The waiter is always removed from the registry on exit (success,
        timeout, or cancellation).
        """
        event = asyncio.Event()
        waiter = (name, predicate, event)
        self._waiters.append(waiter)
        try:
            yield event
        finally:
            self._waiters.remove(waiter)

    async def init_listeners(self) -> None:  # noqa: B027
        """Attach transport listeners. No-op for non-physical devices."""

    async def update_attributes(self) -> None:  # noqa: B027
        """Pull fresh values for all attributes. No-op for non-physical devices."""

    async def update_once(self) -> None:  # noqa: B027
        """Open transport, read all attributes, close. No-op for non-physical."""

    def rebuild_attribute(self, attribute_driver: AttributeDriver) -> None:
        """Not supported on non-physical devices."""
        msg = f"{type(self).__name__} does not support rebuilding attributes"
        raise NotImplementedError(msg)

    def delete_attribute(self, attribute_name: str) -> None:
        """Not supported on non-physical devices."""
        msg = (
            f"{type(self).__name__} does not support deleting attribute "
            f"'{attribute_name}'"
        )
        raise NotImplementedError(msg)

    def rename_attribute(self, old_name: str, new_name: str) -> None:
        """Not supported on non-physical devices."""
        msg = (
            f"{type(self).__name__} does not support renaming attribute "
            f"'{old_name}' to '{new_name}'"
        )
        raise NotImplementedError(msg)

    def get_attribute(self, attribute_name: str) -> Attribute:
        try:
            return self.attributes[attribute_name]
        except KeyError as ke:
            msg = f"Attribute '{attribute_name}' not found in device '{self.id}'"
            raise NotFoundError(msg) from ke

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
        # Compared here so Attribute stays unaware of the listener contract.
        previous_value = attribute.current_value
        previous = attribute.model_copy() if previous_value is not None else None
        attribute.update_value(new_value)  # ty:ignore[invalid-argument-type]
        if new_value is not None:
            for wname, pred, event in self._waiters:
                if wname == attribute.name and pred(new_value):
                    event.set()
        if self.on_update and attribute.current_value != previous_value:
            self.on_update(self, attribute.name, previous, attribute)

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
        confirm_timeout: float = DEFAULT_CONFIRM_TIMEOUT,
    ) -> Attribute:
        """Write a value to an attribute."""
