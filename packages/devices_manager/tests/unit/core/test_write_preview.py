import pytest

from devices_manager.core.device import Attribute
from devices_manager.core.driver import AttributeRef, WriteConstraints
from devices_manager.core.write_preview import preview_write
from devices_manager.types import DataType


@pytest.mark.parametrize(
    ("attribute", "value", "reason"),
    [
        ("temperature_setpoint", 23, None),
        ("temperature", 23, "not_writable"),
        ("missing", 23, "unknown_attribute"),
        ("temperature_setpoint", "not a number", "invalid_value"),
    ],
)
def test_preview_uses_write_contract_without_changing_values(
    device, attribute, value, reason
):
    before = device.get_attribute("temperature_setpoint").current_value
    result = preview_write(device, attribute, value)
    assert result.reason == reason
    assert result.eligible == (reason is None)
    assert device.get_attribute("temperature_setpoint").current_value == before


@pytest.mark.parametrize(
    ("value", "known_bound", "eligible"),
    [
        (23.5, 24.0, True),
        (25, 24.0, False),
        (23.3, 24.0, False),
        (23.5, None, False),
    ],
)
def test_preview_checks_live_per_device_constraints(
    device, value, known_bound, eligible
):
    attribute = device.get_attribute("temperature_setpoint")
    attribute.write_constraints = WriteConstraints(
        minimum=18, maximum=AttributeRef(attribute="temperature"), step=0.5
    )
    device.get_attribute("temperature").current_value = known_bound
    result = preview_write(device, "temperature_setpoint", value)
    assert result.eligible == eligible
    assert result.reason == (None if eligible else "constraints")
    assert result.constraints is not None
    assert result.constraints.minimum == 18
    assert result.constraints.maximum == known_bound
    assert result.constraints.step == 0.5
    assert result.constraints.unknown == (
        [] if known_bound is not None else ["maximum"]
    )


@pytest.mark.parametrize(
    ("locked", "eligible"), [(True, False), (False, True), (None, False)]
)
def test_group_preview_checks_presentation_blockers_on_each_member(
    device, locked, eligible
):
    from devices_manager.core.presentation import PresentationEnvelope

    device.driver.presentation = PresentationEnvelope.model_validate(
        {
            "schema_version": 1,
            "requires": ["conditions/1"],
            "bindings": {
                "target": {"attribute": "temperature_setpoint"},
                "lock": {"attribute": "state"},
            },
            "controls": {
                "target": {
                    "kind": "number",
                    "binding": "target",
                    "label": {"default": "Target"},
                }
            },
            "page": {
                "kind": "device-face",
                "label": {"default": "Face"},
                "view_box": {"width": 100, "height": 100},
                "layers": [
                    {
                        "kind": "button",
                        "box": {"x": 0, "y": 0, "width": 20, "height": 20},
                        "label": {"default": "+"},
                        "action": {"control": "target", "op": "increment"},
                        "blocked_when": {"op": "eq", "binding": "lock", "value": True},
                    }
                ],
            },
        }
    )
    device.attributes["state"] = Attribute.create(
        "state", DataType.BOOL, {"read"}, value=locked
    )
    result = preview_write(device, "temperature_setpoint", 23)
    assert result.eligible == eligible
    assert result.reason == (None if eligible else "control_blocked")
