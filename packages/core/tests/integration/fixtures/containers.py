import contextlib
import tempfile
from collections.abc import Generator
from pathlib import Path
from typing import Literal

import docker
import pytest
import yaml
from docker.errors import NotFound

from .config import HTTP_PORT, MODBUS_PORT, MQTT_PORT, TMK_DEVICE_ID

thermocktat_image = "ghcr.io/agrid-dev/thermocktat:v0.2.5"
mosquitto_image = "eclipse-mosquitto:2.0"

thermocktat_initial_state = {
    "enabled": False,
    "ambient_temperature": 21.0,
    "temperature_setpoint": 22.0,
    "temperature_setpoint_min": 16.0,
    "temperature_setpoint_max": 28.0,
    "mode": "auto",
    "fan_speed": "auto",
}

type ControllerKey = Literal["http", "mqtt", "modbus"]


def build_config(controller: ControllerKey) -> dict:
    controller_configs: dict[ControllerKey, dict] = {
        "http": {"enabled": True, "addr": ":8080"},
        "mqtt": {
            "enabled": True,
            "addr": f"tcp://host.docker.internal:{MQTT_PORT}",
            "qos": 0,
            "retain_snapshot": False,
            "publish_interval": "0.5s",
            "publish_mode": "interval",
        },
        "modbus": {
            "enabled": True,
            "addr": f"0.0.0.0:{MODBUS_PORT}",
            "unit_id": 4,
            "sync_interval": "1s",
        },
    }
    return {
        "device_id": TMK_DEVICE_ID,
        "controllers": {controller: controller_configs[controller]},
        "thermostat": thermocktat_initial_state,
    }


@pytest.fixture(scope="module")
def thermocktat_container_http() -> Generator[str]:
    client = docker.from_env()
    config = build_config("http")
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(config, f)
        config_path = f.name
    container = None
    try:
        # Run the container with the custom config
        container = client.containers.run(
            thermocktat_image,
            command="-config /config.yaml",
            volumes={config_path: {"bind": "/config.yaml", "mode": "ro"}},
            ports={"8080/tcp": HTTP_PORT},
            detach=True,
            remove=True,
        )
        yield f"http://localhost:{HTTP_PORT}"
    finally:
        if container is not None:
            with contextlib.suppress(NotFound):
                container.stop()
        Path(config_path).unlink()


@pytest.fixture(scope="module")
def thermocktat_container_mqtt() -> Generator[str]:
    """Start a thermocktat container with MQTT enabled.
    Requires mosquitto_container to be running.
    """
    client = docker.from_env()
    config = build_config("mqtt")
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(config, f)
        config_path = f.name
    container = None
    try:
        # Use the same Docker network as mosquitto for internal communication
        container = client.containers.run(
            thermocktat_image,
            command="-config /config.yaml",
            volumes={config_path: {"bind": "/config.yaml", "mode": "ro"}},
            detach=True,
            remove=True,
            network_mode="bridge",
            extra_hosts={"host.docker.internal": "host-gateway"},
        )
        yield config["device_id"]
    finally:
        if container is not None:
            with contextlib.suppress(NotFound):
                container.stop()
        Path(config_path).unlink()


@pytest.fixture(scope="module")
def thermocktat_container_modbus() -> Generator[tuple[str, int]]:
    """Start a thermocktat container with Modbus TCP enabled.
    Yields (host, port) for connecting to the modbus server.
    """
    client = docker.from_env()
    config = build_config("modbus")
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(config, f)
        config_path = f.name
    container = None
    try:
        container = client.containers.run(
            thermocktat_image,
            command="-config /config.yaml",
            volumes={config_path: {"bind": "/config.yaml", "mode": "ro"}},
            ports={"1502/tcp": MODBUS_PORT},
            detach=True,
            remove=True,
        )
        yield ("localhost", MODBUS_PORT)
    finally:
        if container is not None:
            with contextlib.suppress(NotFound):
                container.stop()
        Path(config_path).unlink()
