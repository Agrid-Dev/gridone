"""Driver-declared quality and capabilities exercised through real acquisitions."""

# ruff: noqa: SLF001
# Exercise acquisition scheduling and trust without adding test-only public APIs.

import asyncio
from unittest.mock import AsyncMock

import pytest

from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.device.dependency_refresh import DependencyRefresh
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    HealthCheck,
    UpdateStrategy,
)
from devices_manager.types import ConnectionStatus
from models.errors import InvalidError


def spec(name, **fields: object):
    return AttributeDriver.model_validate(
        {
            "name": name,
            "data_type": "float",
            "read": f"GET /{name}",
            "write": f"POST /{name}",
            **fields,
        }
    )


def make_device(
    transport, *attributes: AttributeDriver, healthcheck: HealthCheck | None = None
):
    driver = Driver(
        metadata=DriverMetadata(id="observations"),
        env={},
        device_config_required=[],
        transport=transport.protocol,
        update_strategy=UpdateStrategy(polling_enabled=False),
        attributes={a.name: a for a in attributes},
        healthcheck=healthcheck or HealthCheck(),
    )
    return CoreDevice.from_base(
        DeviceBase(id="obs", name="Observations", config={}),
        driver=driver,
        transport=transport,
    )


INVALID = [
    {"name": "invalid_values", "argument": [-2147483648, "TRISTATE_NA"]},
    {"name": "scale", "argument": 0.001},
]
SUPPORT = {"op": "eq", "left": {"attribute": "revision"}, "right": "verified"}


@pytest.mark.parametrize("path", ["direct", "sweep", "push"])
@pytest.mark.asyncio
async def test_valid_invalid_valid_never_trusts_a_sentinel(
    path, mock_transport_client, mock_push_transport_client, monkeypatch
):
    transport = mock_push_transport_client if path == "push" else mock_transport_client
    read = {"topic": "/up"} if path == "push" else "GET /sensor"
    device = make_device(
        transport,
        spec("sensor", read=read, codecs=INVALID, write=None),
        spec("target", write_constraints={"minimum": {"attribute": "sensor"}}),
    )
    if path == "push":
        await device.init_listeners()

    async def receive(raw) -> None:
        if path == "push":
            await transport.simulate_event("/up", raw)
        else:
            monkeypatch.setattr(transport, "_read", AsyncMock(return_value=raw))
            if path == "direct":
                await device.read_attribute_value("sensor")
            else:
                await device._read_group(["sensor"])

    try:
        for raw, expected in [(-12000, -12.0), (-2147483648, None), (20000, 20.0)]:
            await receive(raw)
            attribute = device.attributes["sensor"]
            assert attribute.current_value == expected
            assert device._guard.known("sensor") == expected
            assert device._guard.observed_value("sensor") == expected
            assert device._guard.evaluate("target", 25).eligible is (
                expected is not None
            )
            assert (
                attribute.resolution_error.code if attribute.resolution_error else None
            ) == ("invalid_sample" if expected is None else None)
    finally:
        await device.stop_sync()


def record_events(device: CoreDevice) -> list[tuple[str, object, object, bool]]:
    """Capture ``(name, previous value, value, initial)`` for each published change."""
    events: list[tuple[str, object, object, bool]] = []

    def on_update(_device, name, previous, attribute, *, initial) -> None:
        previous_value = None if previous is None else previous.current_value
        events.append((name, previous_value, attribute.current_value, initial))

    device.on_update = on_update
    return events


@pytest.mark.parametrize("path", ["direct", "sweep", "push"])
@pytest.mark.asyncio
async def test_the_first_value_after_an_invalid_sample_is_a_baseline(
    path, mock_transport_client, mock_push_transport_client, monkeypatch
):
    transport = mock_push_transport_client if path == "push" else mock_transport_client
    read = {"topic": "/up"} if path == "push" else "GET /sensor"
    device = make_device(
        transport, spec("sensor", read=read, codecs=INVALID, write=None)
    )
    events = record_events(device)
    if path == "push":
        await device.init_listeners()

    async def receive(raw) -> None:
        if path == "push":
            await transport.simulate_event("/up", raw)
        else:
            monkeypatch.setattr(transport, "_read", AsyncMock(return_value=raw))
            if path == "direct":
                await device.read_attribute_value("sensor")
            else:
                await device._read_group(["sensor"])

    try:
        for raw in (20000, -2147483648, 20000):
            await receive(raw)
        # Unknown breaks continuity: the recovery is a baseline, and `previous`
        # still describes the last known state rather than the gap.
        assert [event for event in events if event[0] == "sensor"] == [
            ("sensor", None, 20.0, True),
            ("sensor", 20.0, None, False),
            ("sensor", 20.0, 20.0, True),
        ]
    finally:
        await device.stop_sync()


@pytest.mark.asyncio
async def test_a_mapped_value_resolved_after_its_input_is_a_baseline(
    mock_transport_client,
):
    device = make_device(
        mock_transport_client,
        spec("first", write=None),
        spec(
            "mode",
            write=None,
            value_mapping={"entries": [{"code": 1, "value": {"attribute": "first"}}]},
        ),
    )
    events = record_events(device)
    device._ingest_attribute("mode", 1)  # observed before its input: unresolved
    device._ingest_attribute("first", 5)  # the reinterpretation resolves it
    assert [event for event in events if event[0] == "mode"] == [
        ("mode", None, 5.0, True)
    ]


@pytest.mark.asyncio
async def test_the_state_before_a_gap_follows_rename_and_delete(
    mock_transport_client,
):
    device = make_device(mock_transport_client, spec("sensor", write=None))
    events = record_events(device)
    device._ingest_attribute("sensor", 20.0)
    device._ingest_attribute("sensor", None, invalid=True)
    # The registry edits the shared driver in place, then tells the device.
    attributes = device.driver.attributes
    attributes["probe"] = spec("probe", write=None)
    del attributes["sensor"]
    device.rename_attribute("sensor", "probe")
    device._ingest_attribute("probe", 21.0)
    assert events[-1] == ("probe", 20.0, 21.0, True)

    device._ingest_attribute("probe", None, invalid=True)
    probe = attributes.pop("probe")
    device.delete_attribute("probe")
    attributes["probe"] = probe
    device.rebuild_attribute("probe")
    device._ingest_attribute("probe", 22.0)
    assert events[-1] == ("probe", None, 22.0, True)  # nothing inherited


@pytest.mark.asyncio
async def test_support_acquired_first_and_unsupported_input_is_not_polled(
    mock_transport_client, monkeypatch
):
    device = make_device(
        mock_transport_client,
        spec("target", write_constraints={"maximum": {"attribute": "limit"}}),
        spec("limit", supported_when=SUPPORT),
        spec("revision", data_type="str", write=None),
    )
    reads = []
    revision = "old"

    async def read(address) -> float | str:
        reads.append(address.id)
        return revision if address.id == "GET /revision" else 30

    monkeypatch.setattr(mock_transport_client, "_read", read)
    assert device._guard.state("limit").support == "unknown"
    await device._read_dependencies(device._dependencies())
    assert reads == ["GET /revision"]
    assert device._guard.state("limit").support == "unsupported"
    assert not device._guard.evaluate("limit", 20).eligible
    with pytest.raises(InvalidError, match="support"):
        await device.read_attribute_value("limit")
    revision = "verified"
    await device._read_dependencies(device._dependencies())
    assert reads[-2:] == ["GET /revision", "GET /limit"]
    assert device._guard.state("limit").support == "supported"
    assert device._guard.evaluate("target", 20).eligible
    revision = "old"
    before = len(reads)
    await device._read_dependencies(device._dependencies())
    assert reads[before:] == ["GET /revision"]
    assert device._guard.known("limit") is None
    assert device._guard.observed_value("limit") is None
    assert device._guard.state("target").missing_attributes == ["limit"]


async def acquired(device: CoreDevice) -> None:
    """Wait for the device's background acquisition, if one was scheduled."""
    if device._dependency_refresh._task is not None:
        await device._dependency_refresh._task


@pytest.mark.asyncio
async def test_start_restart_reconnect_acquire_dependencies_without_writes(
    mock_transport_client, monkeypatch
):
    device = make_device(
        mock_transport_client,
        spec("precision"),
        spec("target", write_constraints={"step": {"attribute": "precision"}}),
    )
    reader = AsyncMock(return_value=0.5)
    writer = AsyncMock()
    monkeypatch.setattr(mock_transport_client, "_read", reader)
    monkeypatch.setattr(mock_transport_client, "write", writer)
    for _ in range(2):
        await device.start_sync(sweep_now=False)
        await acquired(device)
        assert device._guard.state("target").constraints.step == 0.5
        await device.stop_sync()
    await device.start_sync(sweep_now=False)
    await acquired(device)
    device._publish_connection_status(ConnectionStatus.ERROR)
    device._publish_connection_status(ConnectionStatus.OK)
    await acquired(device)
    assert reader.await_count == 4
    writer.assert_not_called()
    await device.stop_sync()


@pytest.mark.asyncio
async def test_failed_dependency_read_does_not_retry_or_unlock(
    mock_transport_client, monkeypatch
):
    device = make_device(
        mock_transport_client,
        spec("precision"),
        spec("target", write_constraints={"step": {"attribute": "precision"}}),
    )
    reader = AsyncMock(side_effect=TimeoutError)
    monkeypatch.setattr(mock_transport_client, "_read", reader)
    await device._dependency_refresh.request()
    assert reader.await_count == 1
    assert not device._guard.evaluate("target", 20).eligible
    await device.stop_sync()


@pytest.mark.asyncio
async def test_stopping_cancels_a_running_pass():
    started = asyncio.Event()

    async def acquire() -> None:
        started.set()
        await asyncio.Event().wait()

    refresh = DependencyRefresh(acquire)
    task = refresh.request()
    await started.wait()
    await refresh.close()
    assert task.cancelled()


@pytest.mark.asyncio
async def test_transport_reconnect_acquires_what_expired_without_waiting_for_a_push(
    mock_transport_client, monkeypatch
):
    from devices_manager.core.transports.base import TransportClient

    device = make_device(
        mock_transport_client,
        spec("precision"),
        spec("target", write_constraints={"step": {"attribute": "precision"}}),
        healthcheck=HealthCheck(expected_push_interval=3600),
    )
    reader = AsyncMock(return_value=0.5)
    monkeypatch.setattr(mock_transport_client, "_read", reader)
    await TransportClient.connect(mock_transport_client)
    await device.start_sync(sweep_now=False)
    await acquired(device)
    assert reader.await_count == 1
    await TransportClient.connect(mock_transport_client)  # still connected
    await TransportClient.close(mock_transport_client)
    await TransportClient.connect(mock_transport_client)  # nothing expired
    await acquired(device)
    assert reader.await_count == 1
    assert device._guard.known("precision") == 0.5
    device._guard.forget("precision")  # expired during the outage
    await TransportClient.close(mock_transport_client)
    await TransportClient.connect(mock_transport_client)
    await acquired(device)
    assert reader.await_count == 2
    await device.stop_sync()
    await TransportClient.close(mock_transport_client)
    await TransportClient.connect(mock_transport_client)
    assert reader.await_count == 2


@pytest.mark.asyncio
async def test_push_only_transport_does_not_schedule_acquisition(
    mock_transport_client, monkeypatch
):
    device = make_device(
        mock_transport_client,
        spec("precision"),
        spec("target", write_constraints={"step": {"attribute": "precision"}}),
    )
    monkeypatch.setattr(mock_transport_client, "read_supported", False)
    reader = AsyncMock()
    monkeypatch.setattr(mock_transport_client, "_read", reader)
    await device.start_sync(sweep_now=False)
    assert device._dependency_refresh._task is None
    reader.assert_not_called()
    assert not device._guard.evaluate("target", 20).eligible
    await device.stop_sync()


@pytest.mark.asyncio
async def test_a_reconnection_during_a_pass_reads_again_what_it_missed(
    mock_transport_client, monkeypatch
):
    """The connection drops while a pass reads: the reconnection it causes buys
    one more pass, which reads what the dropped one could not."""
    device = make_device(
        mock_transport_client,
        spec("precision"),
        spec("target", write_constraints={"step": {"attribute": "precision"}}),
    )
    reading, release = asyncio.Event(), asyncio.Event()
    answers: list[object] = [ConnectionError("dropped"), 0.5]

    async def read(_address) -> object:
        reading.set()
        await release.wait()
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(mock_transport_client, "_read", read)
    await device.start_sync(sweep_now=False)
    await reading.wait()
    device._on_transport_reconnected()
    release.set()
    await acquired(device)

    assert answers == []
    assert device._guard.known("precision") == 0.5
    await device.stop_sync()
