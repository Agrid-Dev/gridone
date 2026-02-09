import pytest
from devices_manager.driver.update_strategy import (
    DEFAULT_POLLING_INTERVAL,
    DEFAULT_READ_TIMEOUT,
)
from devices_manager.dto.driver_dto import DriverDTO
from devices_manager.types import TransportProtocols


@pytest.fixture
def driver_schema_raw():
    return {
        "id": "test_driver",
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
    dto = DriverDTO.model_validate(driver_schema_raw)
    assert dto.id == "test_driver"
    assert dto.transport == TransportProtocols.HTTP
    assert dto.update_strategy.polling_enabled
    assert dto.update_strategy.polling_interval == 15 * 60
    assert dto.update_strategy.read_timeout == 5
    assert len(dto.attributes) == 2


def test_from_dict_empty_update_strategy(driver_schema_raw: dict):
    del driver_schema_raw["update_strategy"]
    dto = DriverDTO.model_validate(driver_schema_raw)
    assert dto.update_strategy.polling_enabled
    assert dto.update_strategy.polling_interval == DEFAULT_POLLING_INTERVAL
    assert dto.update_strategy.read_timeout == DEFAULT_READ_TIMEOUT
