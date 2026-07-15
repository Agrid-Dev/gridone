import asyncio
from collections.abc import Callable

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
from devices_manager.core.transports.read_result import ReadOk
from devices_manager.types import AttributeValueType

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
    async def test_cache_hit_skips_network_read_alongside_concurrent_fetches(
        self,
    ) -> None:
        client = ConcurrentRecordingTransportClient()
        cached_address = MockTransportAddress("cached")
        fresh_addresses = [MockTransportAddress(x) for x in ("a", "b")]
        await client.read(cached_address, "sweep-1")
        assert client.read_calls == 1

        results = {
            r.address_id: r
            async for r in client.read_many(
                [cached_address, *fresh_addresses], "sweep-1"
            )
        }

        assert client.read_calls == 3  # only the two fresh addresses hit the network
        assert client.max_concurrent_reads > 1  # fresh addresses still ran concurrently
        cached_result = results["cached"]
        assert isinstance(cached_result, ReadOk)
        assert cached_result.value == cached_address

    @pytest.mark.asyncio
    async def test_early_exit_cancels_pending_reads(self) -> None:
        client = ConcurrentRecordingTransportClient(read_delay=0.05)
        addresses = [MockTransportAddress(x) for x in ("a", "b", "c")]

        gen = client.read_many(addresses)
        await gen.__anext__()
        await gen.aclose()

        assert client.in_flight == 0

    @pytest.mark.asyncio
    async def test_failing_address_yields_read_error_and_continues(self) -> None:
        class _FlakyConcurrentClient(ConcurrentRecordingTransportClient):
            async def _read(self, address: object) -> str:
                if isinstance(address, MockTransportAddress) and address.id == "bad":
                    msg = "boom"
                    raise ValueError(msg)
                return await self._tracked_read(address)  # type: ignore[return-value]

        client = _FlakyConcurrentClient()
        addresses = [MockTransportAddress("good"), MockTransportAddress("bad")]

        results = {r.address_id: r async for r in client.read_many(addresses)}

        assert isinstance(results["good"].value, MockTransportAddress)  # type: ignore[union-attr]
        assert isinstance(results["bad"].error, ValueError)  # type: ignore[union-attr]


async def _read_concurrently(
    client: HTTPTransportClient | MqttTransportClient,
    addresses: list[HttpAddress] | list[MqttAddress],
) -> tuple[int, set[str]]:
    """Patch ``_read`` with a delayed stub and drive it through ``read_many``.

    Returns the peak concurrent in-flight count and the yielded address ids.
    """
    in_flight = {"current": 0, "max": 0}

    async def fake_read(address: HttpAddress | MqttAddress) -> AttributeValueType:
        in_flight["current"] += 1
        in_flight["max"] = max(in_flight["max"], in_flight["current"])
        await asyncio.sleep(0.02)
        in_flight["current"] -= 1
        return f"value-{address.id}"

    client._read = fake_read  # type: ignore[method-assign]  # noqa: SLF001
    results = [r async for r in client.read_many(addresses)]  # type: ignore[arg-type]
    return in_flight["max"], {r.address_id for r in results}


def _make_http_client() -> HTTPTransportClient:
    return HTTPTransportClient(
        TransportMetadata(id="http-1", name="http"), HttpTransportConfig()
    )


def _make_mqtt_client() -> MqttTransportClient:
    return MqttTransportClient(
        TransportMetadata(id="mqtt-1", name="mqtt"),
        MqttTransportConfig(host="broker", port=1883),
    )


class TestConcreteTransportsUseConcurrentStrategy:
    """HTTPTransportClient/MqttTransportClient mix in ConcurrentReadMixin
    ahead of Pull/PushTransportClient — these guard that MRO wiring so a
    reordered base tuple would fail a test instead of silently reverting to
    the sequential default.
    """

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("make_client", "addresses"),
        [
            (
                _make_http_client,
                [HttpAddress(method="GET", path=f"host/{x}") for x in ("a", "b", "c")],
            ),
            (_make_mqtt_client, [MqttAddress(topic=x) for x in ("a", "b", "c")]),
        ],
        ids=["http", "mqtt"],
    )
    async def test_reads_concurrently(
        self,
        make_client: Callable[[], HTTPTransportClient | MqttTransportClient],
        addresses: list[HttpAddress] | list[MqttAddress],
    ) -> None:
        client = make_client()

        max_in_flight, yielded_ids = await _read_concurrently(client, addresses)

        assert max_in_flight > 1
        assert yielded_ids == {a.id for a in addresses}
