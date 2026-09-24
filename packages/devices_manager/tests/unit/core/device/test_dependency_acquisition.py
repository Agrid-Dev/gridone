"""Dependency acquisition stays within two bounds: a few devices at a time per
transport, a few reads at a time per device. It stops at the first batch that
nobody answers, and leaves the connection status to what the driver polls.

The bounds are written as literals on purpose: a test derived from the
constants it pins could not fail when they change.
"""

# ruff: noqa: SLF001
# Acquisition passes, bounds and the worker are the behaviour under test.

import asyncio
from collections import Counter

import pytest

from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.device.connection_status_attribute import (
    CONNECTION_STATUS_ATTR,
)
from devices_manager.core.device.dependency_refresh import DependencyRefresh
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    HealthCheck,
    UpdateStrategy,
)
from devices_manager.core.transports.base import TransportClient

INPUTS = [f"input_{index}" for index in range(10)]


def spec(name: str, **fields: object) -> AttributeDriver:
    return AttributeDriver.model_validate(
        {
            "name": name,
            "data_type": "float",
            "read": f"GET /${{device}}/{name}",
            "write": None,
            **fields,
        }
    )


def targets(inputs: list[str]) -> list[AttributeDriver]:
    """One writable attribute bounded by each input: the inputs become
    dependencies to acquire."""
    return [
        spec(
            f"target_{index}",
            write="POST /target",
            write_constraints={"minimum": {"attribute": name}},
        )
        for index, name in enumerate(inputs)
    ]


def fleet(
    transport,
    count: int,
    attributes: list[AttributeDriver] | None = None,
    *,
    healthcheck: HealthCheck | None = None,
) -> list[CoreDevice]:
    attributes = attributes or [*(spec(name) for name in INPUTS), *targets(INPUTS)]
    driver = Driver(
        metadata=DriverMetadata(id="acquisition"),
        env={},
        device_config_required=[],
        transport=transport.protocol,
        update_strategy=UpdateStrategy(polling_enabled=False),
        attributes={a.name: a for a in attributes},
        healthcheck=healthcheck or HealthCheck(),
    )
    return [
        CoreDevice.from_base(
            DeviceBase(
                id=f"d{index}", name=f"Device {index}", config={"device": f"d{index}"}
            ),
            driver=driver,
            transport=transport,
        )
        for index in range(count)
    ]


class Wire:
    """Answers each read after a short delay, and records how many input reads
    (the dependencies) are in flight on the transport and per device."""

    def __init__(self, answer: object = 1.0, delay: float = 0.005) -> None:
        self.answer = answer
        self.delay = delay
        self.reads: list[str] = []
        self._flying: Counter[str] = Counter()
        self.max_total = 0
        self.max_per_device = 0

    async def read(self, address) -> object:
        device = address.id.split("/")[1]
        counted = "/target" not in address.id and "/bounded" not in address.id
        self.reads.append(address.id)
        if counted:
            self._flying[device] += 1
            self.max_total = max(self.max_total, self._flying.total())
            self.max_per_device = max(self.max_per_device, self._flying[device])
        try:
            await asyncio.sleep(self.delay)
            if isinstance(self.answer, Exception):
                raise self.answer
            return self.answer
        finally:
            if counted:
                self._flying[device] -= 1


async def acquired(*devices: CoreDevice) -> None:
    """Wait for the background acquisition of each device to finish."""
    await asyncio.gather(
        *(d._dependency_refresh._task for d in devices if d._dependency_refresh._task)
    )


@pytest.mark.asyncio
async def test_a_fleet_start_reads_a_few_devices_and_inputs_at_a_time(
    mock_transport_client, monkeypatch
):
    wire = Wire()
    monkeypatch.setattr(mock_transport_client, "_read", wire.read)
    devices = fleet(mock_transport_client, 12)

    for device in devices:
        device._request_dependencies()
    await acquired(*devices)

    assert len(wire.reads) == 12 * len(INPUTS)
    assert all(d._guard.known(name) == 1.0 for d in devices for name in INPUTS)
    assert wire.max_per_device == 4
    assert wire.max_total == 16  # 4 devices at a time, 4 reads each


@pytest.mark.asyncio
async def test_an_absent_device_costs_one_batch(mock_transport_client, monkeypatch):
    wire = Wire(answer=TimeoutError("no reply"))
    monkeypatch.setattr(mock_transport_client, "_read", wire.read)
    (device,) = fleet(mock_transport_client, 1)

    device._request_dependencies()
    await acquired(device)

    assert len(wire.reads) == 4
    assert device._guard.known(INPUTS[0]) is None


@pytest.mark.asyncio
async def test_inputs_answered_with_a_sentinel_do_not_end_the_acquisition(
    mock_transport_client, monkeypatch
):
    """A sentinel is a successful read whose value stays unknown: only reads
    that fail tell that the device is not answering."""
    invalid = [{"name": "invalid_values", "argument": [-1]}]
    attributes = [*(spec(name, codecs=invalid) for name in INPUTS), *targets(INPUTS)]
    wire = Wire(answer=-1)
    monkeypatch.setattr(mock_transport_client, "_read", wire.read)
    (device,) = fleet(mock_transport_client, 1, attributes)

    device._request_dependencies()
    await acquired(device)

    assert len(wire.reads) == len(INPUTS)


@pytest.mark.asyncio
async def test_inputs_sharing_an_address_are_read_once(
    mock_transport_client, monkeypatch
):
    # alpha and zulu read the same address, four inputs apart in name order.
    names = ["alpha", "bravo", "charlie", "delta", "echo", "zulu"]
    shared = "GET /${device}/shared"
    attributes = [
        *(
            spec(name, read=shared) if name in {"alpha", "zulu"} else spec(name)
            for name in names
        ),
        *targets(names),
    ]
    wire = Wire()
    monkeypatch.setattr(mock_transport_client, "_read", wire.read)
    (device,) = fleet(mock_transport_client, 1, attributes)

    device._request_dependencies()
    await acquired(device)

    assert wire.reads.count("GET /d0/shared") == 1
    assert len(wire.reads) == 5


@pytest.mark.asyncio
async def test_acquisition_leaves_the_connection_status_alone(
    mock_transport_client, monkeypatch
):
    """An input missing from a device's firmware never answers: judging the
    connection on it would pin the device as degraded for good."""
    monkeypatch.setattr(
        mock_transport_client, "_read", Wire(answer=TimeoutError("no reply")).read
    )
    (device,) = fleet(mock_transport_client, 1)
    before = device.attributes[CONNECTION_STATUS_ATTR].current_value

    device._request_dependencies()
    await acquired(device)

    assert device.attributes[CONNECTION_STATUS_ATTR].current_value == before
    assert device.connection_monitor.logs(INPUTS[0]).read == []


@pytest.mark.asyncio
async def test_a_reconnection_keeps_trust_and_reads_only_what_is_missing(
    mock_transport_client, monkeypatch
):
    wire = Wire()
    monkeypatch.setattr(mock_transport_client, "_read", wire.read)
    (device,) = fleet(
        mock_transport_client, 1, healthcheck=HealthCheck(expected_push_interval=3600)
    )
    await TransportClient.connect(mock_transport_client)
    await device.start_sync()
    await acquired(device)
    assert len(wire.reads) == len(INPUTS)

    device._guard.forget(INPUTS[0])  # this one expired during the outage
    await TransportClient.close(mock_transport_client)
    await TransportClient.connect(mock_transport_client)
    assert device._guard.known(INPUTS[1]) == 1.0
    await acquired(device)

    assert wire.reads[len(INPUTS) :] == ["GET /d0/input_0"]
    await device.stop_sync()


@pytest.mark.asyncio
async def test_a_reconnection_drops_what_would_never_expire(
    mock_transport_client, monkeypatch
):
    """Without a push interval or polling, nothing would ever expire these
    inputs: after an outage they are read again rather than trusted forever."""
    wire = Wire()
    monkeypatch.setattr(mock_transport_client, "_read", wire.read)
    (device,) = fleet(mock_transport_client, 1)
    await TransportClient.connect(mock_transport_client)
    await device.start_sync()
    await acquired(device)

    await TransportClient.close(mock_transport_client)
    await TransportClient.connect(mock_transport_client)
    assert device._guard.known(INPUTS[1]) is None
    await acquired(device)

    assert sorted(wire.reads[len(INPUTS) :]) == sorted(wire.reads[: len(INPUTS)])
    await device.stop_sync()


@pytest.mark.asyncio
async def test_requests_made_during_a_pass_buy_exactly_one_more_pass():
    started, release = asyncio.Event(), asyncio.Event()
    passes = 0

    async def acquire() -> None:
        nonlocal passes
        passes += 1
        started.set()
        await release.wait()

    refresh = DependencyRefresh(acquire)
    task = refresh.request()
    await started.wait()
    refresh.request()
    refresh.request()
    release.set()
    await task

    assert passes == 2
    await refresh.close()


@pytest.mark.asyncio
async def test_an_explicit_refresh_does_not_queue_behind_the_fleet(
    mock_transport_client, monkeypatch
):
    wire = Wire()
    monkeypatch.setattr(mock_transport_client, "_read", wire.read)
    (device,) = fleet(mock_transport_client, 1)
    while not mock_transport_client.acquisitions.locked():
        await mock_transport_client.acquisitions.acquire()  # the fleet holds them

    await asyncio.wait_for(device.refresh_attribute("target_0"), 1)

    assert wire.reads == ["GET /d0/input_0", "GET /d0/target_0"]


@pytest.mark.asyncio
async def test_an_explicit_refresh_shares_the_device_bound(
    mock_transport_client, monkeypatch
):
    bounded = spec(
        "bounded",
        write="POST /bounded",
        write_constraints={
            "minimum": {"attribute": "input_0"},
            "maximum": {"attribute": "input_1"},
            "step": {"attribute": "input_2"},
        },
    )
    attributes = [*(spec(name) for name in INPUTS), *targets(INPUTS), bounded]
    wire = Wire(delay=0.02)
    monkeypatch.setattr(mock_transport_client, "_read", wire.read)
    (device,) = fleet(mock_transport_client, 1, attributes)

    device._request_dependencies()
    await device.refresh_attribute("bounded")
    await acquired(device)

    # Background and explicit dependency reads share the device bound; the
    # refreshed attribute itself is read like any poll.
    assert wire.max_per_device <= 4
    assert "GET /d0/bounded" in wire.reads
