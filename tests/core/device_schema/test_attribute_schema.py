import pytest

from core.device_schema.attribute_schema import AttributeSchema


@pytest.mark.skip(reason="from_dict not implemented yet")
def test_attribute_schema_from_dict() -> None:
    data = {
        "attribute_name": "temperature",
        "data_type": "float",
        "protocol_key": "{base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true",
        "json_path": "current_weather.temperature",
    }
    schema = AttributeSchema.from_dict(data)
    assert schema.attribute_name == "temperature"
