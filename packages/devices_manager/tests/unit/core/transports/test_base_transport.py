import asyncio
import logging
from collections.abc import Callable

import pytest
from pydantic import ValidationError

from devices_manager.core.transports import TransportMetadata
from devices_manager.core.transports import base as base_module
from devices_manager.core.transports.base import TerminalConnectionError
from devices_manager.core.transports.http_transport import HTTPTransportClient
from devices_manager.core.transports.http_transport.http_address import HttpAddress
from devices_manager.core.transports.io_timing import IO_LOGGER_NAME
from devices_manager.core.transports.mqtt_transport import (
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.core.transports.mqtt_transport.mqtt_address import MqttAddress
from devices_manager.core.transports.read_result import ReadError, ReadOk
from devices_manager.core.transports.sweep_memo import SweepMemo
from devices_manager.types import AttributeValueType, TransportProtocols

from ..fixtures.recording_transport import (
    READ_DELAY,
    RecordingTransportClient,
    SerializedTransportClient,
)
from ..fixtures.transport_clients import (
    MockTransportAddress,
    make_http_transport_client,
)


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


class _CoordinatedCloseTransportClient(SerializedTransportClient):
    """Mimics the real transports' close(): read_lock before connection_lock."""

    def __init__(
        self,
        *,
        read_delay: float = 0.02,
        shared_state: dict[str, int] | None = None,
    ) -> None:
        super().__init__(read_delay=read_delay, shared_state=shared_state)
        self.closed = False

    async def close(self) -> None:
        async with self._read_lock, self._connection_lock:
            self.closed = True
            await super().close()


class _ReconnectingCoordinatedTransportClient(_CoordinatedCloseTransportClient):
    """Like the real @connected transports: _read reconnects if not connected,
    from inside read()'s held _read_lock."""

    def __init__(
        self,
        *,
        read_delay: float = 0.02,
        shared_state: dict[str, int] | None = None,
    ) -> None:
        super().__init__(read_delay=read_delay, shared_state=shared_state)
        self.connect_calls = 0
        self._is_connected = False

    async def connect(self) -> None:
        async with self._connection_lock:
            self.connect_calls += 1
            self._is_connected = True

    async def close(self) -> None:
        self._is_connected = False
        await super().close()

    async def _read(self, address: object) -> str:
        if not self._is_connected:
            await self.connect()
        return await super()._read(address)


class TestReconnectCoordination:
    @pytest.mark.asyncio
    async def test_close_waits_for_in_flight_read(self) -> None:
        client = _CoordinatedCloseTransportClient()
        read_started = asyncio.Event()
        release_read = asyncio.Event()

        async def blocking_read(address: str) -> str:
            read_started.set()
            await release_read.wait()
            return address

        client._read = blocking_read  # type: ignore[method-assign]  # noqa: SLF001
        read_task = asyncio.create_task(client.read("a"))
        await read_started.wait()

        close_task = asyncio.create_task(client.close())
        await asyncio.sleep(0)
        assert not client.closed

        release_read.set()
        await read_task
        await close_task
        assert client.closed

    @pytest.mark.asyncio
    async def test_read_triggered_reconnect_does_not_deadlock_against_close(
        self,
    ) -> None:
        client = _ReconnectingCoordinatedTransportClient()

        await asyncio.wait_for(
            asyncio.gather(client.read("a"), client.close()), timeout=1
        )

        assert client.connect_calls >= 1


class TestReadCache:
    @pytest.mark.asyncio
    async def test_same_sweep_id_dedupes_network_reads(self) -> None:
        client = RecordingTransportClient()
        address = MockTransportAddress("a")

        first = await client.read(address, "sweep-1")
        second = await client.read(address, "sweep-1")

        assert client.read_calls == 1
        assert first == second

    @pytest.mark.asyncio
    async def test_new_sweep_id_refetches(self) -> None:
        client = RecordingTransportClient()
        address = MockTransportAddress("a")

        await client.read(address, "sweep-1")
        await client.read(address, "sweep-2")

        assert client.read_calls == 2

    @pytest.mark.asyncio
    async def test_no_sweep_id_always_hits_network(self) -> None:
        client = RecordingTransportClient()
        address = MockTransportAddress("a")

        await client.read(address)
        await client.read(address)

        assert client.read_calls == 2
        assert client._sweep_memo._entries == {}  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_close_does_not_clear_sweep_memo(self) -> None:
        # The memo is scoped by sweep_id, not by connection lifecycle, so
        # close() no longer clears it — a same-sweep read after a reconnect is
        # still served from the memo (no generation counter to invalidate it).
        client = RecordingTransportClient()
        address = MockTransportAddress("a")

        await client.read(address, "sweep-1")
        await client.close()
        await client.read(address, "sweep-1")

        assert client.read_calls == 1

    @pytest.mark.asyncio
    async def test_memory_bounded_to_one_entry_per_address(self) -> None:
        client = RecordingTransportClient()
        address = MockTransportAddress("a")

        for i in range(100):
            await client.read(address, f"sweep-{i}")

        assert len(client._sweep_memo._entries) == 1  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_keyword_arguments_are_memoized(self) -> None:
        client = RecordingTransportClient()
        address = MockTransportAddress("a")

        first = await client.read(address=address, sweep_id="sweep-1")
        second = await client.read(address=address, sweep_id="sweep-1")

        assert client.read_calls == 1
        assert first == second


class TestSweepMemo:
    def _memo(self, window: int) -> SweepMemo:
        return SweepMemo("my-transport", TransportProtocols.HTTP, window=window)

    def test_recall_returns_value_only_for_matching_sweep(self) -> None:
        memo = self._memo(window=10)

        memo.remember("a", "sweep-1", "v")

        assert memo.recall("a", "sweep-1") == "v"
        assert memo.recall("a", "sweep-2") is None
        assert memo.recall("b", "sweep-1") is None

    def test_miss_counts_network_hit_does_not(self) -> None:
        memo = self._memo(window=10)

        memo.record(hit=False)
        memo.record(hit=True)

        assert memo._reads == 2  # noqa: SLF001
        assert memo._network == 1  # noqa: SLF001  # ratio 0.5, never exceeds 1

    def test_resets_after_window(self) -> None:
        memo = self._memo(window=3)

        for _ in range(3):
            memo.record(hit=False)

        assert memo._reads == 0  # noqa: SLF001
        assert memo._network == 0  # noqa: SLF001

    def test_emits_ratio_and_transport_every_window(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        memo = self._memo(window=2)

        with caplog.at_level(logging.INFO):
            memo.record(hit=False)
            memo.record(hit=True)

        emitted = [r for r in caplog.records if r.message == "sweep memo"]
        assert len(emitted) == 1
        assert emitted[0].network_per_read == 0.5  # type: ignore[attr-defined]
        assert emitted[0].transport == "my-transport"  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    async def test_decorator_records_sweep_reads_and_skips_on_demand(self) -> None:
        client = RecordingTransportClient()
        address = MockTransportAddress("a")

        await client.read(address, "sweep-1")  # miss -> network + read
        await client.read(address, "sweep-1")  # hit  -> read only
        await client.read(address)  # sweep_id=None -> not recorded

        assert client._sweep_memo._reads == 2  # noqa: SLF001
        assert client._sweep_memo._network == 1  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_failed_read_is_not_counted(self) -> None:
        class _RaisingTransportClient(RecordingTransportClient):
            async def _read(self, address: object) -> str:  # noqa: ARG002
                msg = "boom"
                raise ValueError(msg)

        client = _RaisingTransportClient()

        with pytest.raises(ValueError, match="boom"):
            await client.read(MockTransportAddress("a"), "sweep-1")

        assert client._sweep_memo._reads == 0  # noqa: SLF001
        assert client._sweep_memo._network == 0  # noqa: SLF001


class TestTransportIoMetric:
    @pytest.mark.asyncio
    async def test_single_read_emits_one_metric_with_one_address(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        client = RecordingTransportClient()

        with caplog.at_level(logging.INFO, logger=IO_LOGGER_NAME):
            await client.read(MockTransportAddress("a"))

        assert len(caplog.records) == 1
        fields = caplog.records[0].__dict__
        assert fields["addresses"] == 1
        assert fields["status"] == "ok"
        assert fields["protocol"] == TransportProtocols.HTTP

    @pytest.mark.asyncio
    async def test_memo_hit_emits_no_metric(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        client = RecordingTransportClient()
        address = MockTransportAddress("a")

        with caplog.at_level(logging.INFO, logger=IO_LOGGER_NAME):
            await client.read(address, "sweep-1")  # miss: one real transaction
            caplog.clear()
            await client.read(address, "sweep-1")  # hit: no I/O

        assert caplog.records == []

    @pytest.mark.asyncio
    async def test_concurrent_fan_out_emits_one_metric_per_read(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        # Concurrent read_many calls read() once per address; each is an
        # independent transaction, so N addresses must emit N metrics, all
        # addresses=1 (never one metric covering the whole fan-out).
        client = RecordingTransportClient()
        addresses = [MockTransportAddress(x) for x in ("a", "b", "c")]

        with caplog.at_level(logging.INFO, logger=IO_LOGGER_NAME):
            [r async for r in client.read_many(addresses)]

        assert len(caplog.records) == 3
        assert all(r.__dict__["addresses"] == 1 for r in caplog.records)


class TestReadMany:
    @pytest.mark.asyncio
    async def test_yields_each_distinct_address(self) -> None:
        client = RecordingTransportClient()
        addresses = [MockTransportAddress("a"), MockTransportAddress("b")]

        results = [r async for r in client.read_many(addresses)]

        assert {r.address_id for r in results} == {"a", "b"}
        assert client.read_calls == 2

    @pytest.mark.asyncio
    async def test_dedupes_addresses_by_id(self) -> None:
        client = RecordingTransportClient()
        addresses = [MockTransportAddress("a"), MockTransportAddress("a")]

        results = [r async for r in client.read_many(addresses)]

        assert len(results) == 1
        assert client.read_calls == 1

    @pytest.mark.asyncio
    async def test_failing_address_yields_read_error_and_continues(self) -> None:
        class _FlakyTransportClient(RecordingTransportClient):
            async def _read(self, address: object) -> str:
                self.read_calls += 1
                address_id = getattr(address, "id", address)
                if address_id == "bad":
                    msg = "boom"
                    raise ValueError(msg)
                return f"value-{address_id}"

        client = _FlakyTransportClient()
        addresses = [MockTransportAddress("good"), MockTransportAddress("bad")]

        results = {r.address_id: r async for r in client.read_many(addresses)}

        assert isinstance(results["good"], ReadOk)
        assert isinstance(results["bad"], ReadError)
        assert isinstance(results["bad"].error, ValueError)

    @pytest.mark.asyncio
    async def test_cache_hit_skips_network_read(self) -> None:
        client = RecordingTransportClient()
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


class TestReadManyStrategy:
    """`_serialize_reads` alone selects the base `read_many` strategy:
    concurrent fan-out when clear (the default), sequential when set.
    """

    @pytest.mark.asyncio
    async def test_default_reads_run_concurrently(self) -> None:
        client = RecordingTransportClient()
        addresses = [MockTransportAddress(x) for x in ("a", "b", "c")]

        results = [r async for r in client.read_many(addresses)]

        assert client.max_concurrent_reads > 1
        assert {r.address_id for r in results} == {"a", "b", "c"}

    @pytest.mark.asyncio
    async def test_serialize_reads_run_sequentially(self) -> None:
        client = SerializedTransportClient()
        addresses = [MockTransportAddress(x) for x in ("a", "b", "c")]

        results = [r async for r in client.read_many(addresses)]

        assert client.max_concurrent_reads == 1
        assert {r.address_id for r in results} == {"a", "b", "c"}

    @pytest.mark.asyncio
    async def test_early_exit_cancels_pending_reads(self) -> None:
        client = RecordingTransportClient(read_delay=0.05)
        addresses = [MockTransportAddress(x) for x in ("a", "b", "c")]

        gen = client.read_many(addresses)
        await gen.__anext__()
        await gen.aclose()

        assert client.in_flight == 0


async def _peak_concurrency(
    client: HTTPTransportClient | MqttTransportClient,
    addresses: list[HttpAddress] | list[MqttAddress],
) -> tuple[int, set[str]]:
    """Drive `read_many` with a delayed `_read` stub, returning the peak
    in-flight count and the yielded address ids.
    """
    in_flight = {"current": 0, "max": 0}

    async def fake_read(address: HttpAddress | MqttAddress) -> AttributeValueType:
        in_flight["current"] += 1
        in_flight["max"] = max(in_flight["max"], in_flight["current"])
        await asyncio.sleep(READ_DELAY)
        in_flight["current"] -= 1
        return f"value-{address.id}"

    client._read = fake_read  # type: ignore[method-assign]  # noqa: SLF001
    results = [r async for r in client.read_many(addresses)]  # type: ignore[arg-type]
    return in_flight["max"], {r.address_id for r in results}


def _make_mqtt_client() -> MqttTransportClient:
    return MqttTransportClient(
        TransportMetadata(id="mqtt-1", name="mqtt"),
        MqttTransportConfig(host="broker", port=1883),
    )


class TestConcreteTransportsDefaultToConcurrent:
    """HTTP/MQTT clear `_serialize_reads`, so they must read concurrently
    through the base `read_many` — guards against a regression to sequential.
    """

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("make_client", "addresses"),
        [
            (
                make_http_transport_client,
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

        max_in_flight, yielded_ids = await _peak_concurrency(client, addresses)

        assert max_in_flight > 1
        assert yielded_ids == {a.id for a in addresses}


class _ReconnectCountingTransportClient(RecordingTransportClient):
    """Counts connect()/close() calls, with a delay so a reconnect can be
    observed as still in-flight. `fail_connects` makes the first N connect()
    calls raise before succeeding; `terminal` makes those failures the kind
    retrying can never fix. Backoff constants are shrunk so tests stay fast."""

    _reconnect_base_delay = 0.01
    _reconnect_backoff_multiplier = 2.0
    _reconnect_max_delay = 0.05

    def __init__(
        self,
        *,
        connect_delay: float = 0.05,
        fail_connects: int = 0,
        terminal: bool = False,
    ) -> None:
        super().__init__()
        self.connect_calls = 0
        self.close_calls = 0
        self._connect_delay = connect_delay
        self._fail_connects = fail_connects
        self._terminal = terminal

    async def connect(self) -> None:
        # Mirrors the real transports: recheck the latch right after
        # acquiring the lock, so a caller queued behind a rejection fails
        # fast instead of repeating it.
        async with self._connection_lock:
            self._raise_if_terminally_rejected()
            await asyncio.sleep(self._connect_delay)
            self.connect_calls += 1
            if self._fail_connects > 0:
                self._fail_connects -= 1
                msg = "boom"
                raise (
                    TerminalConnectionError(msg)
                    if self._terminal
                    else ConnectionError(msg)
                )

    async def close(self) -> None:
        self.close_calls += 1
        await super().close()


class TestScheduleReconnect:
    @pytest.mark.asyncio
    async def test_concurrent_calls_do_not_race_a_second_close_connect_pair(
        self,
    ) -> None:
        client = _ReconnectCountingTransportClient(connect_delay=0.05)

        client.schedule_reconnect()
        client.schedule_reconnect()  # arrives mid-flight, doesn't spawn a racing task
        await asyncio.sleep(0.02)

        assert client.connect_calls == 0  # still mid the first cycle's connect()
        assert client.close_calls == 1  # not 2 — no second close() raced in

    @pytest.mark.asyncio
    async def test_a_call_arriving_mid_flight_still_runs_once_more_after(
        self,
    ) -> None:
        # A call that lands while a reconnect is running must not be dropped
        # (e.g. update_config() firing mid-reconnect) — it's coalesced into
        # exactly one more cycle right after the in-flight one finishes.
        client = _ReconnectCountingTransportClient(connect_delay=0.02)

        client.schedule_reconnect()
        client.schedule_reconnect()  # coalesced into one trailing cycle
        client.schedule_reconnect()  # further calls don't add more cycles
        await asyncio.sleep(0.1)

        assert client.connect_calls == 2
        assert client.close_calls == 2

    @pytest.mark.asyncio
    async def test_a_new_reconnect_can_run_after_the_previous_one_finishes(
        self,
    ) -> None:
        client = _ReconnectCountingTransportClient(connect_delay=0.01)

        client.schedule_reconnect()
        await asyncio.sleep(0.05)
        client.schedule_reconnect()
        await asyncio.sleep(0.05)

        assert client.connect_calls == 2
        assert client.close_calls == 2

    @pytest.mark.asyncio
    async def test_a_failed_connect_is_retried_once_more(self) -> None:
        client = _ReconnectCountingTransportClient(connect_delay=0.01, fail_connects=1)

        client.schedule_reconnect()
        await asyncio.sleep(0.1)

        assert client.connect_calls == 2
        assert client.close_calls == 2

    @pytest.mark.asyncio
    async def test_a_terminal_failure_is_not_retried(self) -> None:
        # A failure that can never succeed (e.g. a rejected certificate) has
        # to stop the loop rather than wait and retry until the config
        # changes — backoff only applies to the retryable path.
        client = _ReconnectCountingTransportClient(
            connect_delay=0.01, fail_connects=100, terminal=True
        )

        client.schedule_reconnect()
        await asyncio.sleep(0.1)

        assert client.connect_calls == 1
        assert client.close_calls == 1

    @pytest.mark.asyncio
    async def test_a_terminal_failure_parks_the_transport_in_an_error_state(
        self,
    ) -> None:
        client = _ReconnectCountingTransportClient(
            connect_delay=0.01, fail_connects=1, terminal=True
        )

        client.schedule_reconnect()
        await asyncio.sleep(0.1)

        assert not client.connection_state.is_connected
        assert client.connection_state.info == "boom"

    @pytest.mark.asyncio
    async def test_a_later_reconnect_keeps_reporting_the_terminal_error(self) -> None:
        # Each reconnect cycle runs close() first, which resets the state to
        # closed(); without re-parking, a permanently refusing transport would
        # report idle with no remediation message.
        client = _ReconnectCountingTransportClient(
            connect_delay=0.01, fail_connects=1, terminal=True
        )
        client.schedule_reconnect()
        await asyncio.sleep(0.1)

        client.schedule_reconnect()
        await asyncio.sleep(0.1)

        assert client.connect_calls == 1  # still never touches the network again
        assert not client.connection_state.is_connected
        assert client.connection_state.info == "boom"


class TestReconnectBackoff:
    """Production-scale constants + mocked `sleep`: verifies the delay math
    without the test actually waiting."""

    @staticmethod
    def _patch_backoff_constants(
        monkeypatch: pytest.MonkeyPatch, *, base: float, multiplier: float, cap: float
    ) -> None:
        monkeypatch.setattr(
            _ReconnectCountingTransportClient, "_reconnect_base_delay", base
        )
        monkeypatch.setattr(
            _ReconnectCountingTransportClient,
            "_reconnect_backoff_multiplier",
            multiplier,
        )
        monkeypatch.setattr(
            _ReconnectCountingTransportClient, "_reconnect_max_delay", cap
        )

    @pytest.mark.asyncio
    async def test_delay_grows_with_consecutive_failures(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        recorded_delays: list[float] = []

        async def fake_sleep(delay: float) -> None:
            recorded_delays.append(delay)

        monkeypatch.setattr(base_module, "sleep", fake_sleep)
        self._patch_backoff_constants(monkeypatch, base=1.0, multiplier=2.0, cap=60.0)
        client = _ReconnectCountingTransportClient(connect_delay=0, fail_connects=3)

        client.schedule_reconnect()
        await asyncio.sleep(0.05)

        assert recorded_delays == [1.0, 2.0, 4.0]
        assert client.connect_calls == 4  # 3 failures + the succeeding attempt
        assert client._reconnect_attempt == 0  # noqa: SLF001

    @pytest.mark.asyncio
    async def test_delay_resets_after_a_successful_reconnect(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        recorded_delays: list[float] = []

        async def fake_sleep(delay: float) -> None:
            recorded_delays.append(delay)

        monkeypatch.setattr(base_module, "sleep", fake_sleep)
        self._patch_backoff_constants(monkeypatch, base=1.0, multiplier=2.0, cap=60.0)
        client = _ReconnectCountingTransportClient(connect_delay=0, fail_connects=2)

        client.schedule_reconnect()  # fails twice, then succeeds
        await asyncio.sleep(0.05)
        assert recorded_delays == [1.0, 2.0]

        client._fail_connects = 1  # noqa: SLF001  # a fresh failure streak
        client.schedule_reconnect()
        await asyncio.sleep(0.05)

        # Starts over from the base delay, not carrying on from 4.0.
        assert recorded_delays == [1.0, 2.0, 1.0]

    @pytest.mark.asyncio
    async def test_delay_is_capped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        recorded_delays: list[float] = []

        async def fake_sleep(delay: float) -> None:
            recorded_delays.append(delay)

        monkeypatch.setattr(base_module, "sleep", fake_sleep)
        self._patch_backoff_constants(monkeypatch, base=1.0, multiplier=2.0, cap=3.0)
        client = _ReconnectCountingTransportClient(connect_delay=0, fail_connects=5)

        client.schedule_reconnect()
        await asyncio.sleep(0.05)

        assert recorded_delays == [1.0, 2.0, 3.0, 3.0, 3.0]

    @pytest.mark.asyncio
    async def test_update_config_resets_the_backoff_streak(self) -> None:
        # An operator's fix shouldn't be penalized by a backoff accumulated
        # from the failure it's fixing.
        client = _ReconnectCountingTransportClient(
            connect_delay=0.005, fail_connects=50
        )

        client.schedule_reconnect()
        await asyncio.sleep(0.1)
        assert client._reconnect_attempt > 0  # noqa: SLF001  # mid failure streak

        client._fail_connects = 0  # noqa: SLF001  # simulate the underlying fix
        client.update_config({})
        await asyncio.sleep(0.1)

        assert client._reconnect_attempt == 0  # noqa: SLF001
        assert client._reconnect_pending is False  # noqa: SLF001


class TestConcurrentTerminalLatch:
    @pytest.mark.asyncio
    async def test_only_one_rejection_reaches_the_network(self) -> None:
        # Several devices sharing one transport all call ensure_connected()
        # before the first rejection is recorded; only the first should pay
        # for a real (failed) connect attempt.
        client = _ReconnectCountingTransportClient(
            connect_delay=0.02, fail_connects=100, terminal=True
        )

        results = await asyncio.gather(
            *(client.ensure_connected() for _ in range(5)),
            return_exceptions=True,
        )

        assert client.connect_calls == 1
        assert all(isinstance(r, TerminalConnectionError) for r in results)

    @pytest.mark.asyncio
    async def test_config_fix_mid_flight_is_not_overwritten_by_the_stale_attempt(
        self,
    ) -> None:
        # A caller's ensure_connected() (task A) is already inside connect()
        # on the old config when update_config() lands and schedules a fresh
        # reconnect (task B). A then fails on the config it started with;
        # its result must not re-park the transport over B's success.
        client = _ReconnectCountingTransportClient(
            connect_delay=0.05, fail_connects=1, terminal=True
        )

        task_a = asyncio.create_task(client.ensure_connected())
        await asyncio.sleep(0.01)  # let A get past the latch check, into connect()
        client.update_config({})  # the operator's fix; schedules task B

        with pytest.raises(TerminalConnectionError):
            await task_a
        await asyncio.sleep(0.1)  # let B's reconnect cycle finish

        # B actually attempted (wasn't short-circuited by A's stale failure)
        # and its result is what stands — not re-parked by A afterwards.
        assert client.connect_calls == 2
        assert client._terminal_error is None  # noqa: SLF001


class TestAttemptGenerationSnapshot:
    def test_explicit_snapshot_refreshes_a_stale_generation(self) -> None:
        # A caller that skips ensure_connected() (e.g. a poll loop, once
        # already connected) must snapshot explicitly to stay current.
        client = _mqtt_client()
        client._snapshot_attempt_generation()  # noqa: SLF001

        client.update_config({}, reconnect=False)

        assert not client._attempt_is_current()  # noqa: SLF001
        client._snapshot_attempt_generation()  # noqa: SLF001
        assert client._attempt_is_current()  # noqa: SLF001


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

    def test_field_error_loc_is_relative_to_the_config_model(self) -> None:
        # AGR-921 shape 2 pinned at its source: the API forwards these loc
        # tuples verbatim, and the UI's field mapping depends on them.
        client = _mqtt_client()

        with pytest.raises(ValidationError) as exc_info:
            client.update_config({"port": 0}, reconnect=False)

        assert [e["loc"] for e in exc_info.value.errors()] == [("port",)]

    def test_model_validator_error_loc_is_the_config_root(self) -> None:
        # Pair rules raise from `@model_validator` -> empty loc; the UI routes
        # that to the form-level banner, so the shape must not drift silently.
        client = _mqtt_client()

        with pytest.raises(ValidationError) as exc_info:
            client.update_config({"client_cert": "cert"}, reconnect=False)

        assert [e["loc"] for e in exc_info.value.errors()] == [()]
