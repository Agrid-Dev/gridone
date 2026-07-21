import asyncio

from devices_manager.core.transports.base import TransportClient
from devices_manager.core.transports.base_transport_config import BaseTransportConfig
from devices_manager.types import TransportProtocols

from .transport_clients import mock_metadata

# Per-read delay wide enough for overlapping reads to be observed as concurrent.
READ_DELAY = 0.02


class RecordingTransportClient(TransportClient):
    """Single recording test double for the read path.

    Counts the network reads that actually reached :meth:`_read` (cache misses)
    via ``read_calls`` and tracks read concurrency via ``max_concurrent_reads``.
    ``_serialize_reads`` selects serial vs concurrent behaviour; ``read_delay``
    defaults to 0 so timing-agnostic tests never sleep. Pass a shared
    ``shared_state`` dict to observe concurrency across several instances.
    """

    protocol = TransportProtocols.HTTP
    _serialize_reads = False

    def __init__(
        self,
        *,
        read_delay: float = 0.0,
        shared_state: dict[str, int] | None = None,
    ) -> None:
        super().__init__(mock_metadata, BaseTransportConfig())
        self._read_delay = read_delay
        self._shared_state = (
            shared_state
            if shared_state is not None
            else {"in_flight": 0, "max_concurrent": 0}
        )
        self.read_calls = 0

    @property
    def max_concurrent_reads(self) -> int:
        return self._shared_state["max_concurrent"]

    @property
    def in_flight(self) -> int:
        return self._shared_state["in_flight"]

    async def connect(self) -> None:
        pass

    async def close(self) -> None:
        await super().close()

    async def write(self, address: object, value: object) -> None:
        pass

    async def _read(self, address: object) -> str:
        self.read_calls += 1
        self._shared_state["in_flight"] += 1
        self._shared_state["max_concurrent"] = max(
            self._shared_state["max_concurrent"], self._shared_state["in_flight"]
        )
        try:
            await asyncio.sleep(self._read_delay)
            return f"value-{self.read_calls}-{getattr(address, 'id', address)}"
        finally:
            self._shared_state["in_flight"] -= 1


class SerializedTransportClient(RecordingTransportClient):
    _serialize_reads = True
