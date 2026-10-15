"""A real broker restart: the transport reconnects by itself, listens again and
tells its devices, with no read or write to wake it up."""

from __future__ import annotations

import asyncio

import pytest
from fixtures.broker import publish_when_ready, wait_until

from devices_manager.core.transports.mqtt_transport import (
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata


@pytest.mark.asyncio
@pytest.mark.integration
async def test_pushes_resume_after_a_broker_restart_without_any_read(broker):
    container, port = broker
    await publish_when_ready(port, "restart/ready", "ping")
    transport = MqttTransportClient(
        TransportMetadata(id="restart", name="Restarted broker"),
        MqttTransportConfig(host="127.0.0.1", port=port),
    )
    reconnects: list[int] = []
    transport.add_reconnect_listener(lambda: reconnects.append(1))
    pushes: list[str] = []
    await transport.register_listener(
        transport.build_address({"topic": "restart/pushes"}), pushes.append
    )
    try:
        await publish_when_ready(port, "restart/pushes", "before")
        await wait_until(lambda: pushes == ["before"])

        await asyncio.to_thread(container.restart, timeout=5)
        await wait_until(lambda: bool(reconnects))
        await publish_when_ready(port, "restart/pushes", "after")
        await wait_until(lambda: pushes == ["before", "after"])
        assert reconnects == [1]

        read = asyncio.create_task(
            transport.read(transport.build_address({"topic": "restart/reads"}))
        )
        # The read's reply topic is registered once its subscription is acked.
        await wait_until(
            lambda: "restart/reads" in transport._message_handlers.list_topics()  # noqa: SLF001
        )
        await publish_when_ready(port, "restart/reads", "value")
        assert await asyncio.wait_for(read, 15) == "value"
    finally:
        await transport.close()
