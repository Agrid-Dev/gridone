from collections.abc import Awaitable, Callable

from devices_manager import Attribute, CoreDevice

RecipientsGetter = Callable[[], Awaitable[list[str]]]

# Narrower than devices_manager's attribute-listener parameter type (which
# also allows a synchronous `None` return): every factory in this package
# builds async listeners, and a Callable[..., Awaitable[None]] is assignable
# wherever the broader parameter type is expected.
AttributeListener = Callable[
    [CoreDevice, str, Attribute | None, Attribute], Awaitable[None]
]

__all__ = ["AttributeListener", "RecipientsGetter"]
