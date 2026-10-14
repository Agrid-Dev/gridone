"""Retained state comes from the broker, including updates and deletions."""

import asyncio

import aiomqtt
import pytest
from fixtures.broker import publish_when_ready, wait_until

from devices_manager.core.transports.mqtt_transport import (
    MqttAddress,
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize("topic_filter", ["retained/state", "retained/+"])
async def test_retained_state_reaches_batches_late_listeners_and_reads(
    broker, topic_filter
):
    _, port = broker
    await publish_when_ready(port, "ready", "ping")
    transport = MqttTransportClient(
        TransportMetadata(id="retained", name="Retained state"),
        MqttTransportConfig(host="127.0.0.1", port=port),
    )
    address = MqttAddress(topic=topic_filter)
    first: list[str] = []
    second: list[str] = []
    late: list[str] = []
    try:
        async with aiomqtt.Client("127.0.0.1", port=port) as publisher:
            await publisher.publish("retained/state", "21.5", qos=1, retain=True)
            await transport.register_listeners(
                [(address, first.append), (address, second.append)]
            )
            await wait_until(lambda: first == second == ["21.5"])

            # The latest live frame is deliberately different from retained
            # state: replaying a local last-value cache would be incorrect.
            await publisher.publish("retained/state", "transient", qos=1)
            await wait_until(lambda: first[-1] == second[-1] == "transient")
            await transport.register_listener(address, late.append)
            await wait_until(lambda: late == ["21.5"])
            assert await asyncio.wait_for(transport.read(address), 2) == "21.5"

            await publisher.publish("retained/state", "22.5", qos=1, retain=True)
            await wait_until(lambda: first[-1] == "22.5")
            assert await asyncio.wait_for(transport.read(address), 2) == "22.5"

            # A zero-length retained publication clears the broker's snapshot.
            await publisher.publish("retained/state", "", qos=1, retain=True)
            await wait_until(lambda: first[-1] == "")
            with pytest.raises(TimeoutError):
                await asyncio.wait_for(transport.read(address), 0.5)
    finally:
        await transport.close()
