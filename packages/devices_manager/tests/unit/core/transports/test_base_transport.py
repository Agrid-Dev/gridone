import asyncio
from dataclasses import dataclass

import pytest
from pydantic import ValidationError

from devices_manager.core.transports import TransportMetadata
from devices_manager.core.transports.base import TransportClient
from devices_manager.core.transports.base_transport_config import BaseTransportConfig
from devices_manager.core.transports.mqtt_transport import (
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.types import TransportProtocols


def _mqtt_client() -> MqttTransportClient:
    return MqttTransportClient(
        TransportMetadata(id="mqtt-1", name="mqtt"),
        MqttTransportConfig(host="broker", port=1883),
    )


class _RecordingTransportClient(TransportClient):
    """Minimal concrete transport that records read concurrency."""

    _serialize_reads = False

    def __init__(
        self,
        *,
        read_delay: float = 0.02,
        shared_state: dict[str, int] | None = None,
    ) -> None:
        super().__init__(
            TransportMetadata(id="test", name="test"), BaseTransportConfig()
        )
        self._read_delay = read_delay
        self._shared_state = (
            shared_state
            if shared_state is not None
            else {"in_flight": 0, "max_concurrent": 0}
        )

    @property
    def max_concurrent_reads(self) -> int:
        return self._shared_state["max_concurrent"]

    async def connect(self) -> None:
        pass

    async def close(self) -> None:
        pass

    async def write(self, address: str, value: object) -> None:
        pass

    async def _read(self, address: str) -> str:
        self._shared_state["in_flight"] += 1
        self._shared_state["max_concurrent"] = max(
            self._shared_state["max_concurrent"], self._shared_state["in_flight"]
        )
        await asyncio.sleep(self._read_delay)
        self._shared_state["in_flight"] -= 1
        return address


class _SerializedTransportClient(_RecordingTransportClient):
    _serialize_reads = True


class TestReadLock:
    @pytest.mark.asyncio
    async def test_default_reads_stay_concurrent(self) -> None:
        client = _RecordingTransportClient()

        await asyncio.gather(client.read("a"), client.read("b"), client.read("c"))

        assert client.max_concurrent_reads > 1

    @pytest.mark.asyncio
    async def test_serialize_reads_never_overlap(self) -> None:
        client = _SerializedTransportClient()

        await asyncio.gather(client.read("a"), client.read("b"), client.read("c"))

        assert client.max_concurrent_reads == 1

    @pytest.mark.asyncio
    async def test_distinct_instances_stay_concurrent_even_when_serialized(
        self,
    ) -> None:
        shared_state = {"in_flight": 0, "max_concurrent": 0}
        client_a = _SerializedTransportClient(shared_state=shared_state)
        client_b = _SerializedTransportClient(shared_state=shared_state)

        await asyncio.gather(client_a.read("a"), client_b.read("b"))

        assert shared_state["max_concurrent"] == 2


@dataclass(frozen=True)
class _FakeAddress:
    id: str


class _CountingTransportClient(TransportClient):
    """Concrete transport that counts underlying network reads."""

    protocol = TransportProtocols.HTTP
    _serialize_reads = False

    def __init__(self) -> None:
        super().__init__(
            TransportMetadata(id="test", name="test"), BaseTransportConfig()
        )
        self.read_calls = 0

    async def connect(self) -> None:
        pass

    async def close(self) -> None:
        await super().close()

    async def write(self, address: object, value: object) -> None:
        pass

    async def _read(self, address: _FakeAddress) -> str:
        self.read_calls += 1
        return f"value-{self.read_calls}-{address.id}"


class TestReadCache:
    @pytest.mark.asyncio
    async def test_same_correlation_id_dedupes_network_reads(self) -> None:
        client = _CountingTransportClient()
        address = _FakeAddress(id="a")

        first = await client.read(address, "sweep-1")
        second = await client.read(address, "sweep-1")

        assert client.read_calls == 1
        assert first == second

    @pytest.mark.asyncio
    async def test_new_correlation_id_refetches(self) -> None:
        client = _CountingTransportClient()
        address = _FakeAddress(id="a")

        await client.read(address, "sweep-1")
        await client.read(address, "sweep-2")

        assert client.read_calls == 2

    @pytest.mark.asyncio
    async def test_no_correlation_id_always_hits_network(self) -> None:
        client = _CountingTransportClient()
        address = _FakeAddress(id="a")

        await client.read(address)
        await client.read(address)

        assert client.read_calls == 2
        assert client._read_cache == {}  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_cache_cleared_on_close(self) -> None:
        client = _CountingTransportClient()
        address = _FakeAddress(id="a")

        await client.read(address, "sweep-1")
        await client.close()
        await client.read(address, "sweep-1")

        assert client.read_calls == 2

    @pytest.mark.asyncio
    async def test_memory_bounded_to_one_entry_per_address(self) -> None:
        client = _CountingTransportClient()
        address = _FakeAddress(id="a")

        for i in range(100):
            await client.read(address, f"sweep-{i}")

        assert len(client._read_cache) == 1  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_close_during_in_flight_read_does_not_resurrect_entry(self) -> None:
        client = _CountingTransportClient()
        address = _FakeAddress(id="a")
        release = asyncio.Event()

        async def blocking_read(_address: _FakeAddress) -> str:
            await release.wait()
            return "post-reconnect"

        client._read = blocking_read  # type: ignore[method-assign]  # noqa: SLF001
        read_task = asyncio.create_task(client.read(address, "sweep-1"))
        await asyncio.sleep(0)  # let the read suspend inside _read

        await client.close()  # clears cache + bumps epoch mid-read
        release.set()
        await read_task

        # The store is skipped because the epoch changed while the read ran.
        assert client._read_cache == {}  # noqa: SLF001


class TestUpdateConfig:
    def test_partial_patch_merges_and_preserves_untouched_fields(self) -> None:
        # Regression (AGR-901): a partial config patch (only `ca_cert`) must
        # merge onto the existing config, not be validated as a standalone
        # config — the required `host` is preserved rather than reported missing.
        client = _mqtt_client()

        client.update_config({"ca_cert": "cert"}, reconnect=False)

        assert client.config.ca_cert == "cert"
        assert client.config.host == "broker"
        assert client.config.port == 1883

    def test_partial_patch_is_validated_against_the_config_class(self) -> None:
        client = _mqtt_client()

        with pytest.raises(ValidationError):
            client.update_config({"port": "not-a-number"}, reconnect=False)

    def test_unknown_field_is_rejected(self) -> None:
        client = _mqtt_client()

        with pytest.raises(ValidationError):
            client.update_config({"nonsense": True}, reconnect=False)
