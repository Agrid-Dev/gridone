from collections.abc import Callable
from datetime import UTC, datetime
from enum import StrEnum
from functools import wraps
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel

if TYPE_CHECKING:
    from .attribute import Attribute


class EventType(StrEnum):
    READ = "read"
    WRITE = "write"
    LISTEN = "listen"


class AttributeEventLog(BaseModel):
    event_type: EventType
    timestamp: datetime
    status: Literal["ok", "error"]
    message: str | None = None


class AttributeLogs(BaseModel):
    read: list[AttributeEventLog]
    write: list[AttributeEventLog]
    listen: list[AttributeEventLog]


def _ok_entry(event_type: EventType) -> AttributeEventLog:
    return AttributeEventLog(
        event_type=event_type, timestamp=datetime.now(UTC), status="ok"
    )


def _error_entry(event_type: EventType, exc: Exception) -> AttributeEventLog:
    return AttributeEventLog(
        event_type=event_type,
        timestamp=datetime.now(UTC),
        status="error",
        message=str(exc),
    )


def _log_event(
    event_type: EventType,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator: appends an ok/error AttributeEventLog to the named attribute.

    Pre-fetches the attribute from ``self.attributes`` to avoid a double dict
    lookup and injects it as ``_log_attribute`` into the wrapped method.
    Falls through without logging when the attribute name is unknown.
    """

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(fn)
        async def wrapper(
            self: Any,  # noqa: ANN401
            attribute_name: str,
            *args: Any,  # noqa: ANN401
            **kwargs: Any,  # noqa: ANN401
        ) -> Any:  # noqa: ANN401
            attribute = self.attributes.get(attribute_name)
            if attribute is None:
                return await fn(self, attribute_name, *args, **kwargs)
            try:
                result = await fn(
                    self, attribute_name, *args, _log_attribute=attribute, **kwargs
                )
                attribute.append_log(_ok_entry(event_type))
            except Exception as e:
                attribute.append_log(_error_entry(event_type, e))
                raise
            else:
                return result
            finally:
                self._on_log_append()

        return wrapper

    return decorator


def _wrap_listen(
    callback: Callable[[object], None],
    attribute: "Attribute",
    *,
    on_append: Callable[[], None] | None = None,
) -> Callable[[object], None]:
    """Wrap a push-listener callback to append a listen event log to the attribute."""

    @wraps(callback)
    def wrapper(v: object) -> None:
        try:
            callback(v)
            attribute.append_log(_ok_entry(EventType.LISTEN))
        except Exception as e:
            attribute.append_log(_error_entry(EventType.LISTEN, e))
            raise
        finally:
            if on_append is not None:
                on_append()

    return wrapper
