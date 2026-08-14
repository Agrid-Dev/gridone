import pytest

from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.driver import (
    AttributeDriver,
    DeviceConfigField,
    Driver,
    DriverMetadata,
    HealthCheck,
    UpdateStrategy,
)
from devices_manager.types import DataType, TransportProtocols

WEBHOOK_PUSH_INTERVAL = 1


@pytest.fixture
def attributes() -> list[AttributeDriver]:
    return [
        AttributeDriver(
            name="temperature",
            data_type=DataType.FLOAT,
            read="GET /temperature",
            write=None,
            codecs=[CodecSpec(name="identity", argument="")],
        ),
        AttributeDriver(
            name="temperature_setpoint",
            data_type=DataType.FLOAT,
            read="GET /${some_id}/setpoint",
            write="POST /${some_id}/setpoint",
            codecs=[CodecSpec(name="identity", argument="")],
        ),
        AttributeDriver(
            name="humidity",
            data_type=DataType.FLOAT,
            read="GET /humidity",
            write=None,
            codecs=[CodecSpec(name="identity", argument="")],
        ),
        AttributeDriver(
            name="temperature_w_adapter",
            data_type=DataType.FLOAT,
            read="GET /temperature_w_adapter",
            write=None,
            codecs=[CodecSpec(name="json_pointer", argument="/data/temperature")],
        ),
        AttributeDriver(
            name="temperature_setpoint_w_reversible_adapter",
            data_type=DataType.FLOAT,
            read="GET /temperature_setpoint_w_reversible_adapter",
            write="POST /temperature_setpoint_w_reversible_adapter",
            codecs=[CodecSpec(name="scale", argument=0.1)],
        ),
    ]


@pytest.fixture
def driver(attributes: list[AttributeDriver]) -> Driver:
    return Driver(
        metadata=DriverMetadata(id="test_driver"),
        env={"base_url": "http://example.com"},
        transport=TransportProtocols.HTTP,
        device_config_required=[DeviceConfigField(name="some_id", required=True)],
        update_strategy=UpdateStrategy(),
        attributes={attribute.name: attribute for attribute in attributes},
    )


def _make_identity_attr(
    name: str, data_type: DataType, *, writable: bool = False
) -> AttributeDriver:
    return AttributeDriver(
        name=name,
        data_type=data_type,
        read=f"GET /{name}",
        write=f"POST /{name}" if writable else None,
        codecs=[CodecSpec(name="identity", argument="")],
    )


@pytest.fixture
def thermostat_driver() -> Driver:
    """A driver with type='thermostat' and all required standard attributes."""
    attrs = [
        _make_identity_attr("temperature", DataType.FLOAT),
        _make_identity_attr("temperature_setpoint", DataType.FLOAT, writable=True),
        _make_identity_attr("onoff_state", DataType.BOOL, writable=True),
        _make_identity_attr("mode", DataType.STRING, writable=True),
        _make_identity_attr("temperature_setpoint_min", DataType.FLOAT),
        _make_identity_attr("temperature_setpoint_max", DataType.FLOAT),
    ]
    return Driver(
        metadata=DriverMetadata(id="thermostat_driver"),
        env={},
        transport=TransportProtocols.HTTP,
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={a.name: a for a in attrs},
        type="thermostat",
    )


@pytest.fixture
def other_http_driver() -> Driver:
    return Driver(
        metadata=DriverMetadata(id="other_http_driver"),
        env={},
        transport=TransportProtocols.HTTP,
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={
            "power": AttributeDriver(
                name="power",
                data_type=DataType.FLOAT,
                read="GET /power",
                write=None,
                codecs=[CodecSpec(name="identity", argument="")],
            ),
            "temperature": AttributeDriver(
                name="temperature",
                data_type=DataType.FLOAT,
                read="GET /temp",
                write=None,
                codecs=[CodecSpec(name="identity", argument="")],
            ),
        },
    )


@pytest.fixture
def strict_http_driver() -> Driver:
    return Driver(
        metadata=DriverMetadata(id="strict_http_driver"),
        env={},
        transport=TransportProtocols.HTTP,
        device_config_required=[
            DeviceConfigField(name="serial", required=True),
        ],
        update_strategy=UpdateStrategy(),
        attributes={},
    )


@pytest.fixture
def push_attributes() -> list[AttributeDriver]:
    return [
        AttributeDriver(
            name="temperature",
            data_type=DataType.FLOAT,
            read={"topic": "/xx/temperature"},
            write=None,
            codecs=[CodecSpec(name="json_pointer", argument="/payload/temperature")],
        )
    ]


@pytest.fixture
def driver_w_push_transport(push_attributes: list[AttributeDriver]) -> Driver:
    return Driver(
        metadata=DriverMetadata(id="test_push_driver"),
        env={},
        device_config_required=[],
        transport=TransportProtocols.MQTT,
        update_strategy=UpdateStrategy(),
        attributes={attribute.name: attribute for attribute in push_attributes},
        discovery_schema={
            "topic": "/xx",
            "field_getters": [
                {"name": "vendor_id", "codecs": [{"json_pointer": "/id"}]},
                {"name": "gateway_id", "codecs": [{"json_pointer": "/gateway_id"}]},
            ],
        },
    )


@pytest.fixture
def hybrid_push_attributes() -> list[AttributeDriver]:
    """One opted-in attribute (push: true) and one left at the default
    (push: false), for a pull+push transport with push_is_opt_in."""
    return [
        AttributeDriver(
            name="pushed_temperature",
            data_type=DataType.FLOAT,
            read={"topic": "/xx/temperature"},
            write=None,
            codecs=[CodecSpec(name="json_pointer", argument="/payload/temperature")],
            push=True,
        ),
        AttributeDriver(
            name="polled_only_humidity",
            data_type=DataType.FLOAT,
            read={"topic": "/xx/humidity"},
            write=None,
            codecs=[CodecSpec(name="json_pointer", argument="/payload/humidity")],
        ),
    ]


@pytest.fixture
def driver_w_hybrid_push_transport(
    hybrid_push_attributes: list[AttributeDriver],
) -> Driver:
    return Driver(
        metadata=DriverMetadata(id="test_hybrid_push_driver"),
        env={},
        device_config_required=[],
        transport=TransportProtocols.OPCUA,
        update_strategy=UpdateStrategy(),
        attributes={attribute.name: attribute for attribute in hybrid_push_attributes},
    )


@pytest.fixture
def webhook_driver() -> Driver:
    """Push-only snapshot driver: both attributes subscribe to a templated
    topic and decode their own field from the pushed JSON."""
    attributes = [
        AttributeDriver(
            name="temperature",
            data_type=DataType.FLOAT,
            read={"topic": "${room_id}/snapshot"},
            write=None,
            codecs=[CodecSpec(name="json_pointer", argument="/temperature")],
        ),
        AttributeDriver(
            name="humidity",
            data_type=DataType.FLOAT,
            read={"topic": "${room_id}/snapshot"},
            write=None,
            codecs=[CodecSpec(name="json_pointer", argument="/humidity")],
        ),
    ]
    return Driver(
        metadata=DriverMetadata(id="webhook_snapshot_driver"),
        env={},
        device_config_required=[],
        transport=TransportProtocols.WEBHOOK,
        update_strategy=UpdateStrategy(polling_enabled=False),
        healthcheck=HealthCheck(expected_push_interval=WEBHOOK_PUSH_INTERVAL),
        attributes={a.name: a for a in attributes},
    )
