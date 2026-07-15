import asyncio

import pytest

from devices_manager.core.transports import TransportMetadata
from devices_manager.core.transports.http_transport import (
    HTTPTransportClient,
    HttpTransportConfig,
)
from devices_manager.core.transports.http_transport.http_address import HttpAddress
from devices_manager.core.transports.mqtt_transport import (
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.core.transports.mqtt_transport.mqtt_address import MqttAddress

from ..fixtures.recording_transport import ConcurrentRecordingTransportClient
from ..fixtures.transport_clients import MockTransportAddress


class TestConcurrentReadMixin:
    @pytest.mark.asyncio
    async def test_reads_run_concurrently(self) -> None:
        client = ConcurrentRecordingTransportClient()
        addresses = [MockTransportAddress(x) for x in ("a", "b", "c")]

        results = [r async for r in client.read_many(addresses)]

        assert client.max_concurrent_reads > 1
        assert {r.address_id for r in results} == {"a", "b", "c"}

    @pytest.mark.asyncio
    async def test_duplicate_addresses_single_flight(self) -> None:
        client = ConcurrentRecordingTransportClient()
        addresses = [
            MockTransportAddress("a"),
            MockTransportAddress("a"),
            MockTransportAddress("a"),
        ]

        results = [r async for r in client.read_many(addresses)]

        assert client.read_calls == 1
        assert len(results) == 1
        assert results[0].address_id == "a"

    @pytest.mark.asyncio
    async def test_early_exit_cancels_pending_reads(self) -> None:
        client = ConcurrentRecordingTransportClient(read_delay=0.05)
        addresses = [MockTransportAddress(x) for x in ("a", "b", "c")]

        gen = client.read_many(addresses)
        await gen.__anext__()
        await gen.aclose()

        assert client.in_flight == 0


class TestConcreteTransportsUseConcurrentStrategy:
    """HTTPTransportClient/MqttTransportClient mix in ConcurrentReadMixin
    ahead of Pull/PushTransportClient — these guard that MRO wiring so a
    reordered base tuple would fail a test instead of silently reverting to
    the sequential default.
    """

    @pytest.mark.asyncio
    async def test_http_client_reads_concurrently(self) -> None:
        client = HTTPTransportClient(
            TransportMetadata(id="http-1", name="http"), HttpTransportConfig()
        )
        in_flight = {"current": 0, "max": 0}

        async def fake_read(address: HttpAddress) -> str:
            in_flight["current"] += 1
            in_flight["max"] = max(in_flight["max"], in_flight["current"])
            await asyncio.sleep(0.02)
            in_flight["current"] -= 1
            return f"value-{address.id}"

        client._read = fake_read  # type: ignore[method-assign]  # noqa: SLF001
        addresses = [
            HttpAddress(method="GET", path=f"host/{x}") for x in ("a", "b", "c")
        ]

        results = [r async for r in client.read_many(addresses)]

        assert in_flight["max"] > 1
        assert {r.address_id for r in results} == {a.id for a in addresses}

    @pytest.mark.asyncio
    async def test_mqtt_client_reads_concurrently(self) -> None:
        client = MqttTransportClient(
            TransportMetadata(id="mqtt-1", name="mqtt"),
            MqttTransportConfig(host="broker", port=1883),
        )
        in_flight = {"current": 0, "max": 0}

        async def fake_read(address: MqttAddress) -> str:
            in_flight["current"] += 1
            in_flight["max"] = max(in_flight["max"], in_flight["current"])
            await asyncio.sleep(0.02)
            in_flight["current"] -= 1
            return f"value-{address.id}"

        client._read = fake_read  # type: ignore[method-assign]  # noqa: SLF001
        addresses = [MqttAddress(topic=x) for x in ("a", "b", "c")]

        results = [r async for r in client.read_many(addresses)]

        assert in_flight["max"] > 1
        assert {r.address_id for r in results} == {a.id for a in addresses}
