import json

from devices_manager.dto.presentation_schema import presentation_schema


def test_option_reason_display_is_advertised():
    schema = presentation_schema()
    assert "option-reason-display/1" in schema.capabilities
    definitions = json.loads(schema.model_dump_json())["json_schema"]["$defs"]
    assert "option_reason_display" in definitions["Control"]["properties"]
    assert definitions["OptionReasonDisplay"]["enum"] == ["inline", "tooltip"]
