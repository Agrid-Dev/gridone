import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime
from enum import StrEnum
from functools import wraps
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel

if TYPE_CHECKING:
    from .attribute import Attribute

_observability_logger = logging.getLogger("devices_manager.observability")


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


def build_entry(
    event_type: EventType, error: Exception | None = None
) -> AttributeEventLog:
    """Build an ok/error AttributeEventLog for `event_type`.

    Shared entry point for callers outside this module (e.g. a read path
    that can't go through the `log_event` decorator) so there's one place
    that decides what an ok/error log entry looks like.
    """
    if error is not None:
        return _error_entry(event_type, error)
    return _ok_entry(event_type)


def log_event(
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
            start = time.perf_counter()
            status: Literal["ok", "error"] = "ok"
            try:
                result = await fn(
                    self, attribute_name, *args, _log_attribute=attribute, **kwargs
                )
                attribute.append_log(_ok_entry(event_type))
            except Exception as e:
                status = "error"
                attribute.append_log(_error_entry(event_type, e))
                raise
            else:
                return result
            finally:
                self._on_log_append()
                _observability_logger.info(
                    "device %s %s",
                    event_type,
                    status,
                    extra={
                        "event": event_type,
                        "status": status,
                        "duration_ms": (time.perf_counter() - start) * 1000,
                        "attribute": attribute_name,
                        "device_id": getattr(self, "id", None),
                        "driver_id": getattr(self, "driver_id", None),
                        "protocol": getattr(
                            getattr(self, "transport", None), "protocol", None
                        ),
                    },
                )

        return wrapper

    return decorator


def wrap_listen(
    callback: Callable[[object], None],
    attribute: "Attribute",
    *,
    on_append: Callable[[], None] | None = None,
    on_data: Callable[[], None] | None = None,
) -> Callable[[object], None]:
    """Wrap a push-listener callback to log a listen event on the attribute.

    The callback is responsible for skipping best-effort decode misses; any
    exception it raises is a genuine failure — logged as an error and re-raised.
    """

    @wraps(callback)
    def wrapper(v: object) -> None:
        try:
            callback(v)
            attribute.append_log(_ok_entry(EventType.LISTEN))
            if on_data is not None:
                on_data()
        except Exception as e:
            attribute.append_log(_error_entry(EventType.LISTEN, e))
            raise
        finally:
            if on_append is not None:
                on_append()

    return wrapper
