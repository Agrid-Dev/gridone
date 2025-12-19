import pytest
from core.driver.driver_schema import DriverSchema
from core.driver.driver_schema.update_strategy import (
    DEFAULT_POLLING_INTERVAL,
    DEFAULT_READ_TIMEOUT,
)
from core.types import TransportProtocols


@pytest.fixture
def driver_schema_raw():
    return {
        "name": "test_driver",
        "transport": "http",
        "device_config": [{"name": "lattitude"}, {"name": "longitude"}],
        "update_strategy": {"polling": "15min", "timeout": "5s"},
        "attributes": [
            {
                "name": "temperature",
                "data_type": "float",
                "read": "GET ${base_url}/?latitude=${lattitude}&longitude=${longitude}&current_weather=true",  # noqa: E501
                "json_pointer": "/current_weather/temperature",
            },
            {
                "name": "wind_speed",
                "data_type": "float",
                "read": "GET ${base_url}/?latitude=${lattitude}&longitude=${longitude}&current_weather=true",  # noqa: E501
                "json_pointer": "/current_weather/wind_speed",
            },
        ],
    }


def test_from_dict(driver_schema_raw: dict):
    schema = DriverSchema.from_dict(driver_schema_raw)
    assert schema.name == "test_driver"
    assert schema.transport == TransportProtocols.HTTP
    assert schema.update_strategy.polling_enabled
    assert schema.update_strategy.polling_interval == 15 * 60
    assert schema.update_strategy.read_timeout == 5
    assert len(schema.attribute_schemas) == 2


def test_from_dict_empty_update_strategy(driver_schema_raw: dict):
    del driver_schema_raw["update_strategy"]
    schema = DriverSchema.from_dict(driver_schema_raw)
    assert schema.update_strategy.polling_enabled
    assert schema.update_strategy.polling_interval == DEFAULT_POLLING_INTERVAL
    assert schema.update_strategy.read_timeout == DEFAULT_READ_TIMEOUT
