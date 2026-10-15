"""Retained state comes from the broker, including updates and deletions.

The broker replays it on SUBSCRIBE, and a topic is subscribed by its first
listener only: a later listener shares the subscription and gets live frames,
while a listen-only read, or the first listener after the last one left (a
replaced device), subscribes again and gets the replay.
"""

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
async def test_retained_state_reaches_first_listeners_and_reads(broker, topic_filter):
    _, port = broker
    await publish_when_ready(port, "ready", "ping")
    transport = MqttTransportClient(
        TransportMetadata(id="retained", name="Retained state"),
        MqttTransportConfig(host="127.0.0.1", port=port),
    )
    address = MqttAddress(topic=topic_filter)
    first: list[str] = []
    late: list[str] = []
    replacing: list[str] = []
    try:
        async with aiomqtt.Client("127.0.0.1", port=port) as publisher:
            await publisher.publish("retained/state", "21.5", qos=1, retain=True)
            first_id = await transport.register_listener(address, first.append)
            await wait_until(lambda: first == ["21.5"])

            # No SUBSCRIBE for a topic already listened to, so no replay: the
            # live frame published afterwards is the first one it sees.
            late_id = await transport.register_listener(address, late.append)
            # The live frame differs from retained state: replaying a local
            # last-value cache would be incorrect.
            await publisher.publish("retained/state", "transient", qos=1)
            await wait_until(lambda: bool(late))
            assert late == ["transient"]
            assert first == ["21.5", "transient"]

            # A listen-only read subscribes again: every listener gets the replay.
            assert await asyncio.wait_for(transport.read(address), 2) == "21.5"
            await wait_until(lambda: late == ["transient", "21.5"])

            # The last listener to leave unsubscribes, so the next one to come
            # subscribes again and gets retained state, as a replaced device does.
            await transport.unregister_listener(first_id, address.topic)
            await transport.unregister_listener(late_id, address.topic)
            await transport.register_listener(address, replacing.append)
            await wait_until(lambda: replacing == ["21.5"])

            await publisher.publish("retained/state", "22.5", qos=1, retain=True)
            await wait_until(lambda: replacing[-1] == "22.5")
            assert await asyncio.wait_for(transport.read(address), 2) == "22.5"

            # A zero-length retained publication clears the broker's snapshot.
            await publisher.publish("retained/state", "", qos=1, retain=True)
            await wait_until(lambda: replacing[-1] == "")
            with pytest.raises(TimeoutError):
                await asyncio.wait_for(transport.read(address), 0.5)
    finally:
        await transport.close()
