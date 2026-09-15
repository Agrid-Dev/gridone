from datetime import UTC, datetime
from enum import StrEnum
from typing import Literal

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
