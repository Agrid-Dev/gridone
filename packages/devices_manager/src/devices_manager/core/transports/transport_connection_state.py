from dataclasses import dataclass

from devices_manager.types import ConnectionStatus


@dataclass(frozen=True)
class TransportConnectionState:
    status: ConnectionStatus
    info: str | None = None

    @property
    def is_connected(self) -> bool:
        return self.status == ConnectionStatus.OK

    @classmethod
    def idle(cls) -> "TransportConnectionState":
        """Default initializer: creates an idle TransportConnectionState."""
        return cls(status=ConnectionStatus.IDLE)

    @classmethod
    def from_dict(cls, data: dict | None) -> "TransportConnectionState":
        """Rebuild from a serialized dict (e.g. ``model_dump``/jsonb output).

        Falls back to an idle state when ``data`` is missing or empty.
        Example input: ``{"status": "ok", "info": None}``.
        """
        if not data:
            return cls.idle()
        return cls(status=ConnectionStatus(data["status"]), info=data.get("info"))

    @classmethod
    def connected(cls) -> "TransportConnectionState":
        return cls(status=ConnectionStatus.OK)

    @classmethod
    def connection_error(cls, info: str | None = None) -> "TransportConnectionState":
        return cls(status=ConnectionStatus.ERROR, info=info)

    @classmethod
    def closed(cls) -> "TransportConnectionState":
        return cls(status=ConnectionStatus.IDLE)
