from collections.abc import Callable
from datetime import UTC, datetime
from enum import StrEnum
from functools import wraps
from typing import Any, Literal

from pydantic import BaseModel


class EventType(StrEnum):
    READ = "read"
    WRITE = "write"
    LISTEN = "listen"


class AttributeEventLog(BaseModel):
    event_type: EventType
    timestamp: datetime
    status: Literal["ok", "error"]
    message: str | None = None

    @classmethod
    def ok(cls, event_type: EventType) -> "AttributeEventLog":
        return cls(event_type=event_type, timestamp=datetime.now(UTC), status="ok")

    @classmethod
    def error(cls, event_type: EventType, exc: Exception) -> "AttributeEventLog":
        return cls(
            event_type=event_type,
            timestamp=datetime.now(UTC),
            status="error",
            message=str(exc),
        )

    @classmethod
    def new(
        cls, event_type: EventType, error: Exception | None = None
    ) -> "AttributeEventLog":
        """An error entry when ``error`` is given, an ok entry otherwise."""
        return cls.ok(event_type) if error is None else cls.error(event_type, error)


class AttributeLogs(BaseModel):
    read: list[AttributeEventLog]
    write: list[AttributeEventLog]
    listen: list[AttributeEventLog]


def log_event(
    event_type: EventType,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator: records an ok/error AttributeEventLog for the named attribute.

    The host exposes ``attributes`` and ``record_event(attribute, entry)``.
    The attribute is pre-fetched to avoid a double dict lookup and injected
    as ``_log_attribute`` into the wrapped method. Falls through without
    logging when the attribute name is unknown.
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
            except Exception as e:
                self.record_event(attribute, AttributeEventLog.error(event_type, e))
                raise
            self.record_event(attribute, AttributeEventLog.ok(event_type))
            return result

        return wrapper

    return decorator


def wrap_listen(
    callback: Callable[[object], None],
    record: Callable[[AttributeEventLog], None],
    *,
    on_data: Callable[[], None] | None = None,
) -> Callable[[object], None]:
    """Wrap a push-listener callback to record a listen event.

    The callback is responsible for skipping best-effort decode misses; any
    exception it raises is a genuine failure — recorded as an error and
    re-raised. ``on_data`` runs before the ok entry is recorded, so whatever
    the record triggers already sees the data as received.
    """

    @wraps(callback)
    def wrapper(v: object) -> None:
        try:
            callback(v)
            if on_data is not None:
                on_data()
        except Exception as e:
            record(AttributeEventLog.error(EventType.LISTEN, e))
            raise
        record(AttributeEventLog.ok(EventType.LISTEN))

    return wrapper
