"""One frame of a shared-topic dump must cost linear time in the attribute count.

Every observation used to re-project the whole device (a full walk of the
driver's attributes and a copy of every trusted value), so a frame carrying N
values was O(N²): a 257-attribute thermostat refresh cost tens of milliseconds
per frame on a laptop and seconds on a site box, on top of the connection
status work AGR-1217 already removed. The write guard now records an
observation in O(1) and projects write states once, when the turn's event or
the next read needs them.

Measured as a ratio between N and 2N attributes on the same run, so the floor
holds on any machine: linear growth doubles the time, quadratic growth
quadruples it. The frame is a dict, as the push transports hand it to every
listener, so decoding stays O(1) per attribute and the ratio isolates ingestion.
"""

from __future__ import annotations

import gc
import time

import pytest

from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    HealthCheck,
    UpdateStrategy,
    WriteConstraints,
)
from devices_manager.core.transports import TransportMetadata
from devices_manager.core.transports.factory import make_transport_config
from devices_manager.dto import device_to_public
from devices_manager.types import DataType, TransportProtocols

from ..fixtures.transport_clients import MockPushTransportClient

N = 500
MAX_GROWTH = 3.0  # linear ≈ 2, quadratic ≈ 4
TOPIC = "gw/AA/dump"


def _wide_driver(count: int) -> Driver:
    attributes = [
        AttributeDriver(
            name=f"p{i}",
            data_type=DataType.FLOAT,
            read={"topic": "gw/${mac}/dump"},
            write={"topic": f"gw/${{mac}}/set/p{i}"},
            write_constraints=WriteConstraints(minimum=0, maximum=100),
            codecs=[CodecSpec(name="json_pointer", argument=f"/p{i}")],
        )
        for i in range(count)
    ]
    return Driver(
        metadata=DriverMetadata(id=f"wide_{count}"),
        env={},
        device_config_required=[],
        transport=TransportProtocols.MQTT,
        update_strategy=UpdateStrategy(polling_enabled=False),
        healthcheck=HealthCheck(expected_push_interval=60),
        attributes={a.name: a for a in attributes},
    )


async def _frame_seconds(count: int) -> float:
    """Best of three timings of one full frame plus the read that publishes it."""
    client = MockPushTransportClient(
        TransportMetadata(id=f"push-{count}", name="push"),
        make_transport_config(TransportProtocols.MQTT, {"host": "localhost"}),
    )
    device = CoreDevice.from_base(
        DeviceBase(id=f"wide-{count}", name="wide", config={"mac": "AA"}),
        driver=_wide_driver(count),
        transport=client,
    )
    await device.start_sync()
    frame = {f"p{i}": float(i) for i in range(count)}
    await client.simulate_event(TOPIC, frame)  # warm-up: codecs, first projection
    device_to_public(device)
    best = float("inf")
    try:
        for _ in range(3):
            gc.collect()
            gc.disable()
            started = time.perf_counter()
            await client.simulate_event(TOPIC, frame)
            dto = device_to_public(device)
            best = min(best, time.perf_counter() - started)
            gc.enable()
    finally:
        gc.enable()
        await device.stop_sync()
    assert device.attributes[f"p{count - 1}"].current_value == float(count - 1)
    state = dto.attributes["p0"].write_state
    assert state is not None
    assert state.status == "ready"
    return best


@pytest.mark.asyncio
@pytest.mark.perf
async def test_full_frame_cost_grows_linearly_with_attribute_count() -> None:
    small = await _frame_seconds(N)
    large = await _frame_seconds(2 * N)
    growth = large / small
    print(
        f"\nframe of {N} attributes: {small * 1e3:.1f} ms; "
        f"{2 * N}: {large * 1e3:.1f} ms -> x{growth:.2f}"
    )
    assert small > 1e-3, f"t({N}) = {small * 1e3:.2f} ms is too small to be signal"
    assert growth < MAX_GROWTH, f"x{growth:.2f} growth for 2x attributes"
