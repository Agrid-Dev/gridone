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
    assert schema.value_parser(example_result) == exemple_temperature
