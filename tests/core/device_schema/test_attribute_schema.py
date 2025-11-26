import pytest

from core.device_schema.attribute_schema import AttributeSchema
from core.types import DataType


def test_attribute_schema_from_dict() -> None:
    data = {
        "name": "temperature",
        "data_type": "float",
        "address": "{base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true",  # noqa: E501
        "json_pointer": "/current_weather/temperature",
    }
    schema = AttributeSchema.from_dict(data)
    assert schema.attribute_name == "temperature"
    assert schema.data_type == DataType.FLOAT
    assert schema.value_parser is not None
    assert schema.value_parser.parser_key == "json_pointer"
    assert schema.value_parser.parser_raw == "/current_weather/temperature"


@pytest.mark.parametrize(
    ("attribute_schema", "context", "expected_address"),
    [
        (
            AttributeSchema.from_dict(
                {
                    "name": "temperature",
                    "data_type": "float",
                    "address": "${base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true",  # noqa: E501
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
    assert attribute_schema.render(context).address == expected_address
