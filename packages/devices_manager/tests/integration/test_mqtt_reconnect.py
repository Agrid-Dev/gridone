"""A real broker restart: the transport reconnects by itself, listens again and
tells its devices, with no read or write to wake it up."""

from __future__ import annotations

import asyncio
import contextlib
import socket
import tempfile
import time
from pathlib import Path
from typing import TYPE_CHECKING

import aiomqtt
import pytest
from docker.errors import NotFound
from fixtures.containers import mosquitto_image

import docker
from devices_manager.core.transports.mqtt_transport import (
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata

if TYPE_CHECKING:
    from collections.abc import Callable, Generator

    from docker.models.containers import Container


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture
def broker() -> Generator[tuple[Container, int]]:
    """A broker of this test's own: it restarts it, and CI's broker is shared."""
    port = _free_port()
    with tempfile.NamedTemporaryFile("w", suffix=".conf", delete=False) as conf:
        conf.write("listener 1883\nallow_anonymous true\n")
    container = docker.from_env().containers.run(
        mosquitto_image,
        volumes={conf.name: {"bind": "/mosquitto/config/mosquitto.conf", "mode": "ro"}},
        ports={"1883/tcp": ("127.0.0.1", port)},
        detach=True,
        remove=True,
    )
    try:
        yield container, port
    finally:
        with contextlib.suppress(NotFound):
            container.stop(timeout=0)
        Path(conf.name).unlink()


async def _until(predicate: Callable[[], bool], within: float = 60) -> None:
    deadline = time.monotonic() + within
    while not predicate():
        if time.monotonic() > deadline:
            msg = "condition not met in time"
            raise TimeoutError(msg)
        await asyncio.sleep(0.1)


async def _publish(port: int, topic: str, payload: str) -> None:
    """Publish from another client, once the broker accepts connections."""
    deadline = time.monotonic() + 60
    while True:
        try:
            async with aiomqtt.Client("127.0.0.1", port=port) as client:
                await client.publish(topic, payload)
                return
        except aiomqtt.MqttError:
            if time.monotonic() > deadline:
                raise
            await asyncio.sleep(0.2)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_pushes_resume_after_a_broker_restart_without_any_read(broker):
    container, port = broker
    await _publish(port, "restart/ready", "ping")
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
        await _publish(port, "restart/pushes", "before")
        await _until(lambda: pushes == ["before"])

        await asyncio.to_thread(container.restart, timeout=5)
        await _until(lambda: bool(reconnects))
        await _publish(port, "restart/pushes", "after")
        await _until(lambda: pushes == ["before", "after"])
        assert reconnects == [1]

        read = asyncio.create_task(
            transport.read(transport.build_address({"topic": "restart/reads"}))
        )
        # The read's reply topic is registered once its subscription is acked.
        await _until(
            lambda: "restart/reads" in transport._message_handlers.list_topics()  # noqa: SLF001
        )
        await _publish(port, "restart/reads", "value")
        assert await asyncio.wait_for(read, 15) == "value"
    finally:
        await transport.close()
