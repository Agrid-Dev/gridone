from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass
class TransportMetadata:
    id: str
    name: str
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))
