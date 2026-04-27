from dataclasses import dataclass
from datetime import datetime

from models.types import Severity


@dataclass(frozen=True)
class Notification:
    id: str
    title: str
    body: str
    severity: Severity
    correlation_id: str | None
    created_by: str | None
    created_at: datetime


@dataclass(frozen=True)
class NotificationDispatch:
    """A notification dispatched to a specific user."""

    notification: Notification
    user_id: str
    dispatched_at: datetime
    dismissed_at: datetime | None
