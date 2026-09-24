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


def make_device(transport, *attributes: AttributeDriver):
    driver = Driver(
        metadata=DriverMetadata(id="observations"),
        env={},
        device_config_required=[],
        transport=transport.protocol,
        update_strategy=UpdateStrategy(polling_enabled=False),
        attributes={a.name: a for a in attributes},
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
        await device._dependency_refresh.request(set())
        assert device._guard.state("target").constraints.step == 0.5
        await device.stop_sync()
    await device.start_sync(sweep_now=False)
    await device._dependency_refresh.request(set())
    device._publish_connection_status(ConnectionStatus.ERROR)
    device._publish_connection_status(ConnectionStatus.OK)
    await device._dependency_refresh.request(set())
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
    await device._dependency_refresh.request(device._dependencies())
    assert reader.await_count == 1
    assert not device._guard.evaluate("target", 20).eligible
    await device.stop_sync()


@pytest.mark.asyncio
async def test_coalesces_concurrent_dependencies_and_cancels_on_stop():
    started, release = asyncio.Event(), asyncio.Event()
    batches = []

    async def read(names) -> None:
        batches.append(names)
        started.set()
        await release.wait()

    refresh = DependencyRefresh(read)
    first = refresh.request({"a", "b"})
    await started.wait()
    second = refresh.request({"b", "c"})
    assert first is second
    release.set()
    await first
    assert batches == [{"a", "b"}, {"c"}]
    task = refresh.request({"a"}, delay=10)
    await refresh.close()
    assert task.cancelled()


@pytest.mark.asyncio
async def test_transport_reconnect_acquires_without_waiting_for_a_device_push(
    mock_transport_client, monkeypatch
):
    from devices_manager.core.transports.base import TransportClient

    device = make_device(
        mock_transport_client,
        spec("precision"),
        spec("target", write_constraints={"step": {"attribute": "precision"}}),
    )
    reader = AsyncMock(return_value=0.5)
    monkeypatch.setattr(mock_transport_client, "_read", reader)
    await TransportClient.connect(mock_transport_client)
    await device.start_sync(sweep_now=False)
    await device._dependency_refresh.request(set())
    assert reader.await_count == 1
    await TransportClient.connect(mock_transport_client)  # still connected
    assert reader.await_count == 1
    await TransportClient.close(mock_transport_client)
    await TransportClient.connect(mock_transport_client)
    assert device._guard.known("precision") is None
    await device._dependency_refresh.request(set())
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
    await device._dependency_refresh.request(set())
    reader.assert_not_called()
    assert not device._guard.evaluate("target", 20).eligible
    await device.stop_sync()


@pytest.mark.asyncio
async def test_reconnect_during_acquisition_schedules_one_fresh_pass():
    started, release = asyncio.Event(), asyncio.Event()
    batches = []

    async def read(names) -> None:
        batches.append(set(names))
        started.set()
        await release.wait()

    refresh = DependencyRefresh(read)
    task = refresh.request({"a"})
    await started.wait()
    refresh.request({"a"}, repeat_active=True)
    refresh.request({"a"}, repeat_active=True)
    release.set()
    await task
    assert batches == [{"a"}, {"a"}]
    await refresh.close()
