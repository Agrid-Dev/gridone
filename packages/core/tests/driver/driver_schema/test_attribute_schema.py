import pytest
from core.driver.driver_schema.attribute_schema import (
    AttributeSchema,
    RawTransportAddress,
)
from core.types import DataType


def test_attribute_schema_from_dict() -> None:
    data = {
        "name": "temperature",
        "data_type": "float",
        "read": "GET {base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true",  # noqa: E501
        "json_pointer": "/current_weather/temperature",
    }
    schema = AttributeSchema.from_dict(data)
    assert schema.name == "temperature"
    assert schema.data_type == DataType.FLOAT
    assert schema.value_parser is not None
    assert schema.value_parser[0].parser_key == "json_pointer"
    assert schema.value_parser[0].parser_raw == "/current_weather/temperature"
    assert schema.read == data["read"]
    assert schema.write is None


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
    schema = AttributeSchema.from_dict({**base_data, **addresses})
    assert schema.read == expected_read
    assert schema.write == expected_write


@pytest.mark.parametrize(
    ("attribute_schema", "context", "expected_address"),
    [
        (
            AttributeSchema.from_dict(
                {
                    "name": "temperature",
                    "data_type": "float",
                    "read": "${base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true",  # noqa: E501
                    "json_pointer": "/current_weather/temperature",
                },
            ),
            {
                "base_url": "https://api.open-meteo.com/v1/forecast",
            },
            "https://api.open-meteo.com/v1/forecast/?latitude={lattitude}&longitude={longitude}&current_weather=true",
        ),
    ],
)
def test_render(
    attribute_schema: AttributeSchema,
    context: dict,
    expected_address: str | dict,
) -> None:
    assert attribute_schema.render(context).read == expected_address
