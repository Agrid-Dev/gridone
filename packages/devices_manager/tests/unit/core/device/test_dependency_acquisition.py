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
from unittest.mock import AsyncMock

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
from devices_manager.core.transports.transport_connection_state import (
    TransportConnectionState,
)
from models.errors import ConfirmationError

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
        *(
            refresh._task
            for d in devices
            for refresh in (d._dependency_refresh, d._target_refresh)
            if refresh._task
        )
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


# `limit` is written and bounds `target_0`. The absent inputs never answer and
# sort before it, so a pass over everything missing would stop on them first.
# `free` is written too but bounds nothing.
ABSENT = [f"absent_{index}" for index in range(4)]
WRITTEN = [
    spec("limit", write="POST /limit"),
    spec("free", write="POST /free"),
    *(spec(name) for name in ABSENT),
    *targets(["limit", *ABSENT]),
]


async def written(transport, monkeypatch, wire: Wire) -> CoreDevice:
    """A syncing device, already reported OK, whose absent inputs never answer."""

    async def read(address) -> object:
        if "/absent_" in address.id:
            wire.reads.append(address.id)
            msg = "no reply"
            raise TimeoutError(msg)
        return await wire.read(address)

    monkeypatch.setattr(transport, "_read", read)
    await TransportClient.connect(transport)
    (device,) = fleet(transport, 1, WRITTEN)
    await device.start_sync()
    await device.read_attribute_value("limit")
    await acquired(device)
    wire.reads.clear()
    return device


async def hold(transport) -> int:
    """Take every acquisition slot, as a busy fleet would; returns how many."""
    held = 0
    while not transport.acquisitions.locked():
        await transport.acquisitions.acquire()
        held += 1
    return held


async def unconfirmed(device: CoreDevice, _transport, _monkeypatch) -> None:
    with pytest.raises(ConfirmationError):
        await device.write_attribute_value("limit", 5.0, confirm_timeout=0.1)


async def unsent(device: CoreDevice, transport, monkeypatch) -> None:
    monkeypatch.setattr(
        transport, "write", AsyncMock(side_effect=ConnectionError("refused"))
    )
    with pytest.raises(ConnectionError):
        await device.write_attribute_value("limit", 5.0)


async def abandoned(device: CoreDevice, _transport, _monkeypatch) -> None:
    forgotten = asyncio.Event()
    device.on_write_state_update = lambda _device: forgotten.set()
    write = asyncio.create_task(device.write_attribute_value("limit", 5.0))
    await forgotten.wait()  # the target is forgotten: being sent
    await asyncio.sleep(0)  # let the confirmation start waiting
    write.cancel()
    with pytest.raises(asyncio.CancelledError):
        await write


@pytest.mark.asyncio
@pytest.mark.parametrize("fail", [unconfirmed, unsent, abandoned])
async def test_a_failed_write_reads_its_target_again_and_only_it(
    mock_transport_client, monkeypatch, fail
):
    """After a firmware refusal or a timeout, the target is read again and what
    it bounds is known again, without waiting for the next push. Inputs that
    never answer are neither retried nor able to stop that read."""
    wire = Wire()
    device = await written(mock_transport_client, monkeypatch, wire)

    await fail(device, mock_transport_client, monkeypatch)
    await acquired(device)

    assert wire.reads == ["GET /d0/limit"]
    assert device.known_attribute_value("limit") == 1.0
    assert device.evaluate_attribute_write("target_0", 2.0).eligible
    await device.stop_sync()


def independent(_transport, _monkeypatch) -> str:
    return "free"


def disconnected(transport, _monkeypatch) -> str:
    """The reconnection acquires what is missing once the link is back."""
    transport.connection_state = TransportConnectionState.connection_error("down")
    return "limit"


def ingress_only(transport, monkeypatch) -> str:
    monkeypatch.setattr(transport, "read_supported", False)
    return "limit"


@pytest.mark.asyncio
@pytest.mark.parametrize("case", [independent, disconnected, ingress_only])
async def test_a_failed_write_that_nothing_can_read_back_starts_no_pass(
    mock_transport_client, monkeypatch, case
):
    wire = Wire()
    device = await written(mock_transport_client, monkeypatch, wire)
    name = case(mock_transport_client, monkeypatch)

    with pytest.raises(ConfirmationError):
        await device.write_attribute_value(name, 5.0, confirm_timeout=0.1)

    assert device._target_refresh._task is None
    assert wire.reads == []
    await device.stop_sync()


@pytest.mark.asyncio
async def test_a_target_observed_before_its_pass_is_not_read_again(
    mock_transport_client, monkeypatch
):
    wire = Wire()
    device = await written(mock_transport_client, monkeypatch, wire)
    held = await hold(mock_transport_client)

    await unconfirmed(device, mock_transport_client, monkeypatch)
    await device.read_attribute_value("limit")  # a poll lands first
    for _ in range(held):
        mock_transport_client.acquisitions.release()
    await acquired(device)

    assert wire.reads == ["GET /d0/limit"]
    await device.stop_sync()


@pytest.mark.asyncio
async def test_stopping_a_device_cancels_its_pending_target_read(
    mock_transport_client, monkeypatch
):
    """A read queued by a failed write never outlives the device."""
    wire = Wire()
    device = await written(mock_transport_client, monkeypatch, wire)
    held = await hold(mock_transport_client)

    await unconfirmed(device, mock_transport_client, monkeypatch)
    pending = device._target_refresh._task
    await device.stop_sync()
    for _ in range(held):
        mock_transport_client.acquisitions.release()

    assert pending is not None
    assert pending.cancelled()
    assert wire.reads == []


@pytest.mark.asyncio
async def test_a_failed_write_on_a_device_not_syncing_starts_nothing(
    mock_transport_client, monkeypatch
):
    """A stopped device has closed its worker: a pass started now would outlive
    it."""
    monkeypatch.setattr(mock_transport_client, "_read", Wire().read)
    await TransportClient.connect(mock_transport_client)
    (device,) = fleet(mock_transport_client, 1, WRITTEN)

    await unconfirmed(device, mock_transport_client, monkeypatch)

    assert device._target_refresh._task is None


@pytest.mark.asyncio
async def test_a_pass_that_fails_is_logged_and_ends_quietly(
    mock_transport_client, monkeypatch, caplog
):
    """A background pass has no caller to raise to: its failure is logged and
    the worker stays usable."""
    wire = Wire()
    device = await written(mock_transport_client, monkeypatch, wire)
    monkeypatch.setattr(
        device, "_read_dependencies", AsyncMock(side_effect=RuntimeError("boom"))
    )

    device._request_dependencies()  # the absent inputs are always missing
    await unconfirmed(device, mock_transport_client, monkeypatch)
    await acquired(device)

    assert "dependency acquisition failed" in caplog.text
    assert "target acquisition failed" in caplog.text
    await device.stop_sync()
