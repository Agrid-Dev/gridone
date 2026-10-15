"""A disposable mosquitto per test, and helpers to wait on it.

For tests that restart the broker or count what reaches it: CI's broker on
``MQTT_PORT`` is shared by every integration test.
"""

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

import docker
from fixtures.containers import mosquitto_image

if TYPE_CHECKING:
    from collections.abc import Callable, Generator

    from docker.models.containers import Container

__all__ = ["broker", "publish_when_ready", "wait_until"]


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture
def broker() -> Generator[tuple[Container, int]]:
    """A broker of this test's own, on a free port: ``(container, port)``."""
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


async def wait_until(predicate: Callable[[], bool], within: float = 60) -> None:
    deadline = time.monotonic() + within
    while not predicate():
        if time.monotonic() > deadline:
            msg = "condition not met in time"
            raise TimeoutError(msg)
        await asyncio.sleep(0.1)


async def publish_when_ready(port: int, topic: str, payload: str) -> None:
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
