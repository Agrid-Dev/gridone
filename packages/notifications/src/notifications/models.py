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
    created_at: datetime


@dataclass(frozen=True)
class NotificationForUser:
    """Notification enriched with per-recipient dismissal state."""

    id: str
    title: str
    body: str
    severity: Severity
    correlation_id: str | None
    created_at: datetime
    dismissed: bool
    dismissed_at: datetime | None
