import asyncio

import pytest
from pydantic import ValidationError

from devices_manager.core.transports import TransportMetadata
from devices_manager.core.transports.base import TransportClient
from devices_manager.core.transports.base_transport_config import BaseTransportConfig
from devices_manager.core.transports.mqtt_transport import (
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.core.transports.read_result import ReadError, ReadOk
from devices_manager.types import TransportProtocols

from ..fixtures.recording_transport import (
    RecordingTransportClient,
    SerializedTransportClient,
)
from ..fixtures.transport_clients import MockTransportAddress, mock_metadata


def _mqtt_client() -> MqttTransportClient:
    return MqttTransportClient(
        TransportMetadata(id="mqtt-1", name="mqtt"),
        MqttTransportConfig(host="broker", port=1883),
    )


class TestReadLock:
    @pytest.mark.asyncio
    async def test_default_reads_stay_concurrent(self) -> None:
        client = RecordingTransportClient()

        await asyncio.gather(client.read("a"), client.read("b"), client.read("c"))

        assert client.max_concurrent_reads > 1

    @pytest.mark.asyncio
    async def test_serialize_reads_never_overlap(self) -> None:
        client = SerializedTransportClient()

        await asyncio.gather(client.read("a"), client.read("b"), client.read("c"))

        assert client.max_concurrent_reads == 1

    @pytest.mark.asyncio
    async def test_distinct_instances_stay_concurrent_even_when_serialized(
        self,
    ) -> None:
        shared_state = {"in_flight": 0, "max_concurrent": 0}
        client_a = SerializedTransportClient(shared_state=shared_state)
        client_b = SerializedTransportClient(shared_state=shared_state)

        await asyncio.gather(client_a.read("a"), client_b.read("b"))

        assert shared_state["max_concurrent"] == 2


class _CountingTransportClient(TransportClient):
    """Concrete transport that counts underlying network reads."""

    protocol = TransportProtocols.HTTP
    _serialize_reads = False

    def __init__(self) -> None:
        super().__init__(mock_metadata, BaseTransportConfig())
        self.read_calls = 0

    async def connect(self) -> None:
        pass

    async def close(self) -> None:
        await super().close()

    async def write(self, address: object, value: object) -> None:
        pass

    async def _read(self, address: MockTransportAddress) -> str:
        self.read_calls += 1
        return f"value-{self.read_calls}-{address.id}"


class TestReadCache:
    @pytest.mark.asyncio
    async def test_same_correlation_id_dedupes_network_reads(self) -> None:
        client = _CountingTransportClient()
        address = MockTransportAddress("a")

        first = await client.read(address, "sweep-1")
        second = await client.read(address, "sweep-1")

        assert client.read_calls == 1
        assert first == second

    @pytest.mark.asyncio
    async def test_new_correlation_id_refetches(self) -> None:
        client = _CountingTransportClient()
        address = MockTransportAddress("a")

        await client.read(address, "sweep-1")
        await client.read(address, "sweep-2")

        assert client.read_calls == 2

    @pytest.mark.asyncio
    async def test_no_correlation_id_always_hits_network(self) -> None:
        client = _CountingTransportClient()
        address = MockTransportAddress("a")

        await client.read(address)
        await client.read(address)

        assert client.read_calls == 2
        assert client._read_cache == {}  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_cache_cleared_on_close(self) -> None:
        client = _CountingTransportClient()
        address = MockTransportAddress("a")

        await client.read(address, "sweep-1")
        await client.close()
        await client.read(address, "sweep-1")

        assert client.read_calls == 2

    @pytest.mark.asyncio
    async def test_memory_bounded_to_one_entry_per_address(self) -> None:
        client = _CountingTransportClient()
        address = MockTransportAddress("a")

        for i in range(100):
            await client.read(address, f"sweep-{i}")

        assert len(client._read_cache) == 1  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_close_during_in_flight_read_does_not_resurrect_entry(self) -> None:
        client = _CountingTransportClient()
        address = MockTransportAddress("a")
        release = asyncio.Event()

        async def blocking_read(_address: MockTransportAddress) -> str:
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


class TestReadMany:
    @pytest.mark.asyncio
    async def test_sequential_default_yields_each_address(self) -> None:
        client = _CountingTransportClient()
        addresses = [MockTransportAddress("a"), MockTransportAddress("b")]

        results = [r async for r in client.read_many(addresses)]

        assert {r.address_id for r in results} == {"a", "b"}
        assert client.read_calls == 2

    @pytest.mark.asyncio
    async def test_dedupes_addresses_by_id(self) -> None:
        client = _CountingTransportClient()
        addresses = [MockTransportAddress("a"), MockTransportAddress("a")]

        results = [r async for r in client.read_many(addresses)]

        assert len(results) == 1
        assert client.read_calls == 1

    @pytest.mark.asyncio
    async def test_failing_address_yields_read_error_and_continues(self) -> None:
        class _FlakyTransportClient(_CountingTransportClient):
            async def _read(self, address: MockTransportAddress) -> str:
                self.read_calls += 1
                if address.id == "bad":
                    msg = "boom"
                    raise ValueError(msg)
                return f"value-{address.id}"

        client = _FlakyTransportClient()
        addresses = [MockTransportAddress("good"), MockTransportAddress("bad")]

        results = {r.address_id: r async for r in client.read_many(addresses)}

        assert isinstance(results["good"], ReadOk)
        assert isinstance(results["bad"], ReadError)
        assert isinstance(results["bad"].error, ValueError)

    @pytest.mark.asyncio
    async def test_cache_hit_skips_network_read(self) -> None:
        client = _CountingTransportClient()
        address = MockTransportAddress("a")
        cached_value = await client.read(address, "sweep-1")
        assert client.read_calls == 1

        results = [r async for r in client.read_many([address], "sweep-1")]

        assert client.read_calls == 1
        assert isinstance(results[0], ReadOk)
        assert results[0].value == cached_value

    @pytest.mark.asyncio
    async def test_interleaved_single_read_not_starved_by_sweep(self) -> None:
        shared_state = {"in_flight": 0, "max_concurrent": 0}
        client = SerializedTransportClient(read_delay=0.05, shared_state=shared_state)
        addresses = [MockTransportAddress(x) for x in ("a", "b", "c")]

        async def drain() -> None:
            async for _ in client.read_many(addresses):
                pass

        sweep_task = asyncio.create_task(drain())
        await asyncio.sleep(0.01)  # let the sweep start and grab the lock once
        loop = asyncio.get_event_loop()
        start = loop.time()
        await client.read(MockTransportAddress("urgent"))
        single_duration = loop.time() - start

        await sweep_task
        # An urgent single read interleaved mid-sweep waits for at most the
        # in-flight transaction, not the whole 3-address sweep (0.15s).
        assert single_duration < 0.1

    @pytest.mark.asyncio
    async def test_collect_returns_full_dict(self) -> None:
        client = _CountingTransportClient()
        addresses = [MockTransportAddress("a"), MockTransportAddress("b")]

        result = await client.collect(addresses)

        assert set(result) == {"a", "b"}


class TestUpdateConfig:
    def test_partial_patch_merges_and_preserves_untouched_fields(self) -> None:
        # Regression: a partial config patch (only `ca_cert`) must
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
