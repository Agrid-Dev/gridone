from collections.abc import Awaitable, Callable

RecipientsGetter = Callable[[], Awaitable[list[str]]]

__all__ = ["RecipientsGetter"]
