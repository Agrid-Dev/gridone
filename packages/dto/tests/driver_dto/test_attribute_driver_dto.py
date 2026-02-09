import pytest
from devices_manager.types import DataType
from dto.driver_dto.attribute_driver_dto import (
    AttributeDriverDTO,
    RawTransportAddress,
)


def test_attribute_schema_from_dict() -> None:
    data = {
        "name": "temperature",
        "data_type": "float",
        "read": "GET {base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true",  # noqa: E501
        "json_pointer": "/current_weather/temperature",
    }
    attribute_dto = AttributeDriverDTO.model_validate(data)
    assert attribute_dto.name == "temperature"
    assert attribute_dto.data_type == DataType.FLOAT
    assert attribute_dto.value_adapters is not None
    assert attribute_dto.value_adapters[0].adapter == "json_pointer"
    assert attribute_dto.value_adapters[0].argument == "/current_weather/temperature"
    assert attribute_dto.read == data["read"]
    assert attribute_dto.write is None


mock_address = (
    "GET {base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true"
)


@pytest.mark.parametrize(
    ("addresses", "expected_read", "expected_write"),
    [
        ({"read": mock_address}, mock_address, None),
        ({"read": mock_address, "write": mock_address}, mock_address, mock_address),
        ({"read_write": mock_address}, mock_address, mock_address),
        (
            {"read_write": mock_address, "write": "other_address"},
            mock_address,
            "other_address",
        ),
        (
            {"read_write": mock_address, "read": "other_address"},
            "other_address",
            mock_address,
        ),
    ],
)
def test_attribute_schema_read_write_addresses(
    addresses: dict,
    expected_read: RawTransportAddress,
    expected_write: RawTransportAddress,
) -> None:
    base_data = {  # everything in attribute_schema except read/write addresses
        "name": "temperature",
        "data_type": "float",
        "json_pointer": "/current_weather/temperature",
    }
    attribute_to = AttributeDriverDTO.model_validate({**base_data, **addresses})
    assert attribute_to.read == expected_read
    assert attribute_to.write == expected_write
