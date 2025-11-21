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
    exemple_temperature = 23.7
    example_result = {
        "current_weather": {
            "temperature": exemple_temperature,
        },
    }
    assert schema.value_parser(example_result) == exemple_temperature  # ty: ignore[invalid-argument-type]


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


def test_render_with_write_address_uses_value_context() -> None:
    schema = AttributeSchema.from_dict(
        {
            "name": "temperature_setpoint",
            "data_type": "float",
            "address": {"method": "POST", "path": "${ip}/show_data"},
            "write_address": {
                "method": "POST",
                "path": "${ip}/update_data",
                "body": {"dataname": "Tsetpoint", "value": "${value}"},
            },
            "json_pointer": "/data/0/value",
        },
    )
    base_context = {"ip": "http://192.168.1.2"}
    # write address is left untouched when not rendering it
    rendered_for_read = schema.render(base_context, render_write_address=False)
    assert rendered_for_read.write_address == schema.write_address

    rendered_for_write = schema.render({**base_context, "value": 22})
    assert rendered_for_write.write_address == {
        "method": "POST",
        "path": "http://192.168.1.2/update_data",
        "body": {"dataname": "Tsetpoint", "value": "22"},
    }
