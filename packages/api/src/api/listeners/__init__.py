from collections.abc import Awaitable, Callable
from typing import Protocol

from devices_manager import Attribute, CoreDevice

RecipientsGetter = Callable[[], Awaitable[list[str]]]


class AttributeListener(Protocol):
    """Narrower than devices_manager's attribute-listener protocol (which also
    allows a synchronous ``None`` return): every factory in this package builds
    async listeners, and an awaitable-returning callable is assignable wherever
    the broader protocol is expected."""

    def __call__(
        self,
        device: CoreDevice,
        attribute_name: str,
        previous: Attribute | None,
        attribute: Attribute,
        /,
        *,
        initial: bool,
    ) -> Awaitable[None]: ...


__all__ = ["AttributeListener", "RecipientsGetter"]
