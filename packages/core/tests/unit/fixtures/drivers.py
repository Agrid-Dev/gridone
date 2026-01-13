import pytest
from core.driver import Driver
from core.driver.driver_schema import DriverSchema
from core.driver.driver_schema.attribute_schema import AttributeSchema
from core.driver.driver_schema.update_strategy import UpdateStrategy
from core.types import DataType, TransportProtocols
from core.value_adapters.factory import ValueAdapterSpec


@pytest.fixture
def simple_driver_schema() -> DriverSchema:
    return DriverSchema(
        name="test_driver",
        transport=TransportProtocols.HTTP,
        update_strategy=UpdateStrategy(),
        device_config_fields=[],
        attribute_schemas=[
            AttributeSchema(
                name="temperature",
                data_type=DataType.FLOAT,
                read="GET /temperature",
                write=None,
                value_adapter=[ValueAdapterSpec(adapter="identity", argument="")],
            ),
            AttributeSchema(
                name="temperature_setpoint",
                data_type=DataType.FLOAT,
                read="GET /${some_id}/setpoint",
                write="POST /${some_id}/setpoint",
                value_adapter=[ValueAdapterSpec(adapter="identity", argument="")],
            ),
            AttributeSchema(
                name="humidity",
                data_type=DataType.FLOAT,
                read="GET /humidity",
                value_adapter=[ValueAdapterSpec(adapter="identity", argument="")],
            ),
            AttributeSchema(
                name="temperature_w_adapter",
                data_type=DataType.FLOAT,
                read="GET /temperature_w_adapter",
                value_adapter=[
                    ValueAdapterSpec(
                        adapter="json_pointer", argument="/data/temperature"
                    )
                ],
            ),
            AttributeSchema(
                name="temperature_setpoint_w_reversible_adapter",
                data_type=DataType.FLOAT,
                read="GET /temperature_setpoint_w_reversible_adapter",
                write="POST /temperature_setpoint_w_reversible_adapter",
                value_adapter=[ValueAdapterSpec(adapter="scale", argument=0.1)],
            ),
        ],
        discovery=None,
    )


@pytest.fixture
def driver(simple_driver_schema: DriverSchema) -> Driver:
    return Driver(
        name="test_driver",
        env={"base_url": "http://example.com"},
        schema=simple_driver_schema,
    )


@pytest.fixture
def push_driver_schema() -> DriverSchema:
    return DriverSchema(
        name="test_push_driver",
        transport=TransportProtocols.MQTT,
        update_strategy=UpdateStrategy(),
        device_config_fields=[],
        attribute_schemas=[
            AttributeSchema(
                name="temperature",
                data_type=DataType.FLOAT,
                read={"topic": "/xx/temperature"},
                write=None,
                value_adapter=[
                    ValueAdapterSpec(
                        adapter="json_pointer", argument="/payload/temperature"
                    )
                ],
            ),
        ],
        discovery={
            "topic": "/xx",
            "field_getters": [
                {"name": "vendor_id", "adapters": [{"json_pointer": "/id"}]},
                {"name": "gateway_id", "adapters": [{"json_pointer": "/gateway_id"}]},
            ],
        },
    )


@pytest.fixture
def driver_w_push_transport(push_driver_schema: DriverSchema) -> Driver:
    return Driver(
        name="test_driver",
        env={"base_url": "http://example.com"},
        schema=push_driver_schema,
    )
