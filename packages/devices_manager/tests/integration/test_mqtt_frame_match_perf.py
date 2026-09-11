"""A push device whose many attributes share one MQTT topic: the Agrid
thermostat, 257 attributes listening on ``updData/<mac>``. A full refresh
answers with 86 frames of three variables each. Without a ``match`` on the read
address, every attribute's codec decodes every frame of the topic (22 102
decodes for 257 values); with ``match: {regex: '"name"\\s*:\\s*"<Var>"'}`` a
frame only reaches the attributes it carries.

Replays one full refresh per thermostat through the broker, once with the
matches and once without, and checks that ``match`` changes what reaches the
codecs, not what the devices end up with — and that it makes dispatch much
cheaper.

Fixtures: ``raw_drivers/agrid_thermostat_mqtts.yaml`` is the production driver
with a regex match on every attribute; ``agrid_thermostat_full_refresh.json`` is
one full refresh in the firmware's own layout (hand-built, pretty-printed), MAC
and IP anonymised, credentials scrubbed.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import aiomqtt
import pytest
import yaml
from fixtures.config import MQTT_PORT

from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.transports import (
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)
from devices_manager.dto.driver_dto import DriverSpec, dto_to_core
from devices_manager.types import TransportProtocols

if TYPE_CHECKING:
    from devices_manager.core.device import Attribute
    from devices_manager.core.driver import Driver

FIXTURES = Path(__file__).parent / "fixtures"
THERMOSTATS = 10
# In-process, matching makes a full refresh ~29x cheaper to dispatch. Broker
# and asyncio costs are the same in both runs, so the end-to-end ratio is
# lower; being a ratio, the floor holds on any machine.
MIN_SPEEDUP = 5

# Published after each thermostat's refresh: frames on one topic arrive in
# order, so once every thermostat holds this value, every frame was applied.
SENTINEL = 2_000_000_000
SENTINEL_FRAME = (
    '{\n  "mac":"A0B1C2D3E4F5",\n  "ip":"10.0.0.2",\n  "ts":1788786200,\n'
    '  "data":[\n    {\n      "name":"Timestamp_UTC",\n'
    '      "type":"DATA_TYPE_INT32",\n      "acl":"r0w0m0",\n'
    f'      "value":{SENTINEL}\n    }}\n  ]\n}}\n'
)


@dataclass
class Replay:
    seconds: float
    values: list[dict[str, object]]


def _driver(namespace: str, *, with_match: bool) -> Driver:
    data = yaml.safe_load(
        (FIXTURES / "raw_drivers" / "agrid_thermostat_mqtts.yaml").read_text()
    )
    for attribute in data["attributes"]:
        read = attribute["read"]
        # Keep the replay away from anything listening on updData/+ on a shared
        # broker (a discovery would pick these thermostats up).
        read["topic"] = f"{namespace}/{read['topic']}"
        if not with_match:
            read.pop("match", None)
    return dto_to_core(DriverSpec.model_validate(data))


async def _replay(driver: Driver, frames: list[str], namespace: str) -> Replay:
    transport = make_transport_client(
        TransportProtocols.MQTT,
        make_transport_config(
            TransportProtocols.MQTT, {"host": "localhost", "port": MQTT_PORT}
        ),
        TransportMetadata(id=namespace, name=namespace),
    )
    applied: dict[str, asyncio.Event] = {}

    def on_update(
        device: CoreDevice, name: str, _previous: Attribute | None, attribute: Attribute
    ) -> None:
        if name == "timestamp_utc" and attribute.current_value == SENTINEL:
            applied[device.id].set()

    devices: list[CoreDevice] = []
    for i in range(THERMOSTATS):
        device = CoreDevice.from_base(
            DeviceBase(
                id=f"{namespace}-{i}",
                name=f"thermostat {i}",
                config={"mac": f"{i:012X}"},
            ),
            transport=transport,
            driver=driver,
            on_update=on_update,
        )
        applied[device.id] = asyncio.Event()
        await device.init_listeners()
        devices.append(device)
    try:
        async with aiomqtt.Client("localhost", MQTT_PORT) as publisher:
            start = time.perf_counter()
            for device in devices:
                topic = f"{namespace}/updData/{device.config['mac']}"
                for frame in frames:
                    await publisher.publish(topic, frame)
                await publisher.publish(topic, SENTINEL_FRAME)
            await asyncio.wait_for(
                asyncio.gather(*(event.wait() for event in applied.values())),
                timeout=180,
            )
            seconds = time.perf_counter() - start
    finally:
        await transport.close()
    return Replay(
        seconds=seconds,
        values=[
            {
                name: attribute.current_value
                for name, attribute in device.attributes.items()
                if name not in {"connection_status", "timestamp_utc"}
            }
            for device in devices
        ],
    )


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.perf
async def test_frame_match_keeps_values_and_cuts_dispatch_cost() -> None:
    frames = json.loads((FIXTURES / "agrid_thermostat_full_refresh.json").read_text())
    run = uuid.uuid4().hex[:8]

    matched = await _replay(
        _driver(f"perf-{run}-m", with_match=True), frames, f"perf-{run}-m"
    )
    unmatched = await _replay(
        _driver(f"perf-{run}-u", with_match=False), frames, f"perf-{run}-u"
    )

    assert matched.values == unmatched.values
    populated = sum(value is not None for value in matched.values[0].values())
    assert populated > 200  # the refresh really fed the devices
    speedup = unmatched.seconds / matched.seconds
    print(
        f"\n{THERMOSTATS} thermostats x {len(frames)} frames, {populated} values each:"
        f" without match {unmatched.seconds:.2f} s, with match {matched.seconds:.2f} s"
        f" → x{speedup:.1f}"
    )
    assert speedup >= MIN_SPEEDUP
