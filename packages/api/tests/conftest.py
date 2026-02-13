import pytest
from devices_manager import Device, DeviceBase
from devices_manager.core.driver import (
    AttributeDriver,
    DeviceConfigField,
    Driver,
    DriverMetadata,
    UpdateStrategy,
)
from devices_manager.core.transports import TransportClient, TransportMetadata
from devices_manager.core.transports.http_transport import (
    HTTPTransportClient,
    HttpTransportConfig,
)
from devices_manager.core.transports.mqtt_transport import (
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.core.value_adapters import ValueAdapterSpec
from devices_manager.types import DataType, TransportProtocols


@pytest.fixture
def mock_transports() -> dict[str, TransportClient]:
    http_transport = HTTPTransportClient(
        metadata=TransportMetadata(id="my-http", name="My Http client"),
        config=HttpTransportConfig(),
    )

    mqtt_transport = MqttTransportClient(
        metadata=TransportMetadata(id="my-mqtt", name="My mqtt broker"),
        config=MqttTransportConfig(host="localhost"),
    )

    async def mqtt_connect_stub():
        pass

    return {tc.metadata.id: tc for tc in [http_transport, mqtt_transport]}


@pytest.fixture
def attributes() -> list[AttributeDriver]:
    return [
        AttributeDriver(
            name="temperature",
            data_type=DataType.FLOAT,
            read="GET /temperature",
            write=None,
            value_adapter_specs=[ValueAdapterSpec(adapter="identity", argument="")],
        ),
        AttributeDriver(
            name="temperature_setpoint",
            data_type=DataType.FLOAT,
            read="GET /${some_id}/setpoint",
            write="POST /${some_id}/setpoint",
            value_adapter_specs=[ValueAdapterSpec(adapter="identity", argument="")],
        ),
    ]


@pytest.fixture
def mock_drivers(attributes: list[AttributeDriver]) -> dict[str, Driver]:
    drivers = [
        Driver(
            metadata=DriverMetadata(id="test_driver"),
            env={"base_url": "http://example.com"},
            transport=TransportProtocols.HTTP,
            device_config_required=[DeviceConfigField(name="some_id")],
            update_strategy=UpdateStrategy(),
            attributes={attribute.name: attribute for attribute in attributes},
        ),
        Driver(
            metadata=DriverMetadata(id="test_push_driver"),
            env={"host": "localhost"},
            transport=TransportProtocols.MQTT,
            device_config_required=[DeviceConfigField(name="some_id")],
            update_strategy=UpdateStrategy(polling_enabled=False),
            attributes={},
            discovery_schema={
                "topic": "thermocktat/#",
                "field_getters": [
                    {"name": "device_id", "adapters": [{"json_pointer": "/device_id"}]}
                ],
            },
        ),
    ]
    return {driver.metadata.id: driver for driver in drivers}


@pytest.fixture
def mock_devices(
    mock_transports: dict[str, TransportClient], mock_drivers: dict[str, Driver]
) -> dict[str, Device]:
    transport = mock_transports["my-http"]
    driver = mock_drivers["test_driver"]
    device_id = "device1"
    base = DeviceBase(id=device_id, name="My device", config={"some_id": "abc"})
    return {device_id: Device.from_base(base, driver=driver, transport=transport)}
