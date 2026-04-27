from dataclasses import dataclass
from datetime import datetime

from models.types import Severity


@dataclass(frozen=True)
class Notification:
    id: int
    title: str
    body: str
    severity: Severity
    correlation_id: str | None
    created_by: str | None
    created_at: datetime


@dataclass(frozen=True)
class NotificationForUser:
    """Notification enriched with per-user dismissal state."""

    id: int
    title: str
    body: str
    severity: Severity
    correlation_id: str | None
    created_at: datetime
    dismissed: bool
    dismissed_at: datetime | None
