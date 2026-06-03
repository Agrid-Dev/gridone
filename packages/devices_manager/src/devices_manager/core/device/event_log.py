from datetime import datetime
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
