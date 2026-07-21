import asyncio

from devices_manager.core.transports.base import TransportClient
from devices_manager.core.transports.base_transport_config import BaseTransportConfig
from devices_manager.core.transports.concurrent_read import ConcurrentReadMixin
from devices_manager.types import TransportProtocols

from .transport_clients import mock_metadata


class ConcurrencyTrackerMixin:
    """Records in-flight/max-concurrent reads via ``shared_state``, so tests
    can prove reads ran serially or in parallel."""

    def _init_tracker(
        self, *, read_delay: float, shared_state: dict[str, int] | None
    ) -> None:
        self._read_delay = read_delay
        self._shared_state = (
            shared_state
            if shared_state is not None
            else {"in_flight": 0, "max_concurrent": 0}
        )

    @property
    def max_concurrent_reads(self) -> int:
        return self._shared_state["max_concurrent"]

    @property
    def in_flight(self) -> int:
        return self._shared_state["in_flight"]

    async def _tracked_read(self, address: object) -> object:
        self._shared_state["in_flight"] += 1
        self._shared_state["max_concurrent"] = max(
            self._shared_state["max_concurrent"], self._shared_state["in_flight"]
        )
        try:
            await asyncio.sleep(self._read_delay)
            return address
        finally:
            self._shared_state["in_flight"] -= 1


class RecordingTransportClient(ConcurrencyTrackerMixin, TransportClient):
    """Minimal concrete transport that records read concurrency."""

    protocol = TransportProtocols.HTTP
    _serialize_reads = False

    def __init__(
        self,
        *,
        read_delay: float = 0.02,
        shared_state: dict[str, int] | None = None,
    ) -> None:
        super().__init__(mock_metadata, BaseTransportConfig())
        self._init_tracker(read_delay=read_delay, shared_state=shared_state)

    async def connect(self) -> None:
        pass

    async def close(self) -> None:
        pass

    async def write(self, address: str, value: object) -> None:
        pass

    async def _read(self, address: str) -> str:
        return await self._tracked_read(address)  # ty: ignore[invalid-return-type]


class SerializedTransportClient(RecordingTransportClient):
    _serialize_reads = True


class ConcurrentRecordingTransportClient(ConcurrencyTrackerMixin, ConcurrentReadMixin):
    """Concurrent-strategy counterpart of :class:`RecordingTransportClient`."""

    protocol = TransportProtocols.HTTP
    _serialize_reads = False

    def __init__(
        self,
        *,
        read_delay: float = 0.02,
        shared_state: dict[str, int] | None = None,
    ) -> None:
        super().__init__(mock_metadata, BaseTransportConfig())
        self._init_tracker(read_delay=read_delay, shared_state=shared_state)
        self.read_calls = 0

    async def connect(self) -> None:
        pass

    async def close(self) -> None:
        await super().close()

    async def write(self, address: object, value: object) -> None:
        pass

    async def _read(self, address: object) -> str:
        self.read_calls += 1
        return await self._tracked_read(address)  # ty: ignore[invalid-return-type]
