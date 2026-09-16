from unittest.mock import AsyncMock

import pytest

from devices_manager.core.driver import AttributeRef, WriteConstraints
from devices_manager.core.write_preview import preview_write


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
@pytest.mark.asyncio
async def test_preview_checks_live_per_device_constraints(
    device, mock_transport_client, value, known_bound, eligible
):
    spec = device.driver.attributes["temperature_setpoint"].model_copy()
    spec.write_constraints = WriteConstraints(
        minimum=18, maximum=AttributeRef(attribute="temperature"), step=0.5
    )
    device.driver.attributes["temperature_setpoint"] = spec
    device.rebuild_attribute("temperature_setpoint")
    if known_bound is not None:
        mock_transport_client.read = AsyncMock(return_value=known_bound)
        await device.read_attribute_value("temperature")
    result = preview_write(device, "temperature_setpoint", value)
    assert result.eligible == eligible
    assert result.reason == (
        None
        if eligible
        else "unknown_dependencies"
        if known_bound is None
        else "constraints"
    )
    assert result.constraints is not None
    assert result.constraints.minimum == 18
    assert result.constraints.maximum == known_bound
    assert result.constraints.step == 0.5
    assert result.constraints.unknown == (
        [] if known_bound is not None else ["maximum"]
    )


def test_generic_preview_does_not_evaluate_presentation_blockers(device):
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
    result = preview_write(device, "temperature_setpoint", 23)
    assert result.eligible
    assert result.reason is None
