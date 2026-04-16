import contextlib
import tempfile
from collections.abc import Generator
from pathlib import Path
from typing import Literal

import pytest
import yaml
from docker.errors import NotFound

import docker

from .config import HTTP_PORT, KNX_PORT, MODBUS_PORT, MQTT_PORT, TMK_DEVICE_ID

thermocktat_image = "ghcr.io/agrid-dev/thermocktat:v0.7.0"
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

type ControllerKey = Literal["http", "mqtt", "modbus", "knx"]

_CONTROLLER_CONFIGS: dict[ControllerKey, dict] = {
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
        "register_count": 2,
    },
    "knx": {
        "enabled": True,
        "addr": f"0.0.0.0:{KNX_PORT}",
        "publish_interval": "0.5s",
    },
}


def build_config(*controllers: ControllerKey) -> dict:
    return {
        "device_id": TMK_DEVICE_ID,
        "controllers": {c: _CONTROLLER_CONFIGS[c] for c in controllers},
        "thermostat": thermocktat_initial_state,
    }


@pytest.fixture(scope="module")
def thermocktat_container_http() -> Generator[str]:
    with _run_thermocktat(build_config("http"), ports={"8080/tcp": HTTP_PORT}):
        yield f"http://localhost:{HTTP_PORT}"


@pytest.fixture(scope="module")
def thermocktat_container_mqtt() -> Generator[str]:
    """Start a thermocktat container with MQTT and HTTP enabled.
    Requires mosquitto_container to be running.
    """
    config = build_config("mqtt", "http")
    # Use the same Docker network as mosquitto for internal communication.
    with _run_thermocktat(
        config,
        ports={"8080/tcp": HTTP_PORT},
        run_kwargs={
            "network_mode": "bridge",
            "extra_hosts": {"host.docker.internal": "host-gateway"},
        },
    ):
        yield config["device_id"]


@pytest.fixture(scope="module")
def thermocktat_container_modbus() -> Generator[tuple[str, int]]:
    """Start a thermocktat container with Modbus TCP enabled.
    Yields (host, port) for connecting to the modbus server.
    """
    with _run_thermocktat(build_config("modbus"), ports={"1502/tcp": MODBUS_PORT}):
        yield ("localhost", MODBUS_PORT)


@contextlib.contextmanager
def _run_thermocktat(
    config: dict, ports: dict, *, run_kwargs: dict | None = None
) -> Generator[None]:
    """Shared lifecycle for thermocktat containers."""
    client = docker.from_env()
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(config, f)
        config_path = f.name
    container = None
    try:
        container = client.containers.run(
            thermocktat_image,
            command="-config /config.yaml",
            volumes={config_path: {"bind": "/config.yaml", "mode": "ro"}},
            ports=ports,
            detach=True,
            remove=True,
            **(run_kwargs or {}),
        )
        yield
    finally:
        if container is not None:
            with contextlib.suppress(NotFound):
                container.stop()
        Path(config_path).unlink()


@pytest.fixture(scope="module")
def thermocktat_container_knx_http() -> Generator[None]:
    """Start a thermocktat container with both KNX and HTTP controllers enabled."""
    with _run_thermocktat(
        build_config("knx", "http"),
        ports={f"{KNX_PORT}/udp": KNX_PORT, "8080/tcp": HTTP_PORT},
    ):
        yield
