from dataclasses import dataclass
from enum import StrEnum


class ConnectionStatus(StrEnum):
    IDLE = "idle"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    CONNECTION_ERROR = "connection_error"
    CLOSING = "closing"
    CLOSED = "closed"


@dataclass(frozen=True)
class TransportConnectionState:
    status: ConnectionStatus
    info: str | None = None

    @property
    def is_connected(self) -> bool:
        return self.status == ConnectionStatus.CONNECTED

    @classmethod
    def idle(cls) -> "TransportConnectionState":
        """Default initializer: creates an idle TransportConnectionState."""
        return cls(status=ConnectionStatus.IDLE)

    @classmethod
    def connecting(cls) -> "TransportConnectionState":
        return cls(status=ConnectionStatus.CONNECTING)

    @classmethod
    def connected(cls) -> "TransportConnectionState":
        return cls(status=ConnectionStatus.CONNECTED)

    @classmethod
    def connection_error(cls, info: str | None = None) -> "TransportConnectionState":
        return cls(status=ConnectionStatus.CONNECTION_ERROR, info=info)

    @classmethod
    def closing(cls) -> "TransportConnectionState":
        return cls(status=ConnectionStatus.CLOSING)

    @classmethod
    def closed(cls) -> "TransportConnectionState":
        return cls(status=ConnectionStatus.CLOSED)
