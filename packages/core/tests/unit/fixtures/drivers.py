import pytest
from core.driver import AttributeDriver, Driver, DriverMetadata, UpdateStrategy
from core.types import DataType, TransportProtocols
from core.value_adapters.factory import ValueAdapterSpec


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
        AttributeDriver(
            name="humidity",
            data_type=DataType.FLOAT,
            read="GET /humidity",
            write=None,
            value_adapter_specs=[ValueAdapterSpec(adapter="identity", argument="")],
        ),
        AttributeDriver(
            name="temperature_w_adapter",
            data_type=DataType.FLOAT,
            read="GET /temperature_w_adapter",
            write=None,
            value_adapter_specs=[
                ValueAdapterSpec(adapter="json_pointer", argument="/data/temperature")
            ],
        ),
        AttributeDriver(
            name="temperature_setpoint_w_reversible_adapter",
            data_type=DataType.FLOAT,
            read="GET /temperature_setpoint_w_reversible_adapter",
            write="POST /temperature_setpoint_w_reversible_adapter",
            value_adapter_specs=[ValueAdapterSpec(adapter="scale", argument=0.1)],
        ),
    ]


@pytest.fixture
def driver(attributes: list[AttributeDriver]) -> Driver:
    return Driver(
        metadata=DriverMetadata(id="test_driver"),
        env={"base_url": "http://example.com"},
        transport=TransportProtocols.HTTP,
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={attribute.name: attribute for attribute in attributes},
    )


@pytest.fixture
def push_attributes() -> list[AttributeDriver]:
    return [
        AttributeDriver(
            name="temperature",
            data_type=DataType.FLOAT,
            read={"topic": "/xx/temperature"},
            write=None,
            value_adapter_specs=[
                ValueAdapterSpec(
                    adapter="json_pointer", argument="/payload/temperature"
                )
            ],
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
                {"name": "vendor_id", "adapters": [{"json_pointer": "/id"}]},
                {"name": "gateway_id", "adapters": [{"json_pointer": "/gateway_id"}]},
            ],
        },
    )
