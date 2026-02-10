import pytest
from devices_manager.core.transports import (
    TransportClient,
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)
from devices_manager.types import TransportProtocols

from .config import MODBUS_PORT, MQTT_PORT


@pytest.fixture
def mqtt_transport() -> TransportClient:
    return make_transport_client(
        TransportProtocols.MQTT,
        make_transport_config(
            TransportProtocols.MQTT, {"host": "localhost", "port": MQTT_PORT}
        ),
        TransportMetadata(id="my-transport", name="my-transport"),
    )


@pytest.fixture
def http_transport() -> TransportClient:
    return make_transport_client(
        TransportProtocols.HTTP,
        make_transport_config(TransportProtocols.HTTP, None),
        TransportMetadata(id="my-transport", name="my-transport"),
    )


@pytest.fixture
def modbus_transport() -> TransportClient:
    return make_transport_client(
        TransportProtocols.MODBUS_TCP,
        make_transport_config(
            TransportProtocols.MODBUS_TCP, {"host": "localhost", "port": MODBUS_PORT}
        ),
        TransportMetadata(id="my-transport", name="my-transport"),
    )
