import pytest
from pydantic import TypeAdapter

from devices_manager.core.presentation import PresentationEnvelope
from devices_manager.core.presentation.group_conditions import (
    evaluate_condition,
    group_write_blocked,
)
from devices_manager.core.presentation.models import Condition


@pytest.mark.parametrize(
    ("condition", "values", "expected"),
    [
        ({"op": "eq", "binding": "a", "value": True}, {"a": 1}, False),
        ({"op": "eq", "binding": "a", "value": 1}, {"a": 1.0}, True),
        ({"op": "in", "binding": "a", "values": [1, 2]}, {"a": 2}, True),
        ({"op": "is_known", "binding": "a"}, {}, False),
        (
            {"op": "not", "condition": {"op": "eq", "binding": "a", "value": True}},
            {},
            None,
        ),
        ({"op": "not", "condition": {"op": "is_known", "binding": "a"}}, {}, True),
        (
            {
                "op": "all",
                "conditions": [
                    {"op": "is_known", "binding": "a"},
                    {"op": "eq", "binding": "b", "value": True},
                ],
            },
            {},
            False,
        ),
        (
            {"op": "all", "conditions": [{"op": "eq", "binding": "b", "value": True}]},
            {},
            None,
        ),
        (
            {
                "op": "any",
                "conditions": [
                    {"op": "is_known", "binding": "a"},
                    {"op": "eq", "binding": "b", "value": True},
                ],
            },
            {"a": 1},
            True,
        ),
        (
            {"op": "any", "conditions": [{"op": "eq", "binding": "b", "value": True}]},
            {},
            None,
        ),
        ({"op": "any", "conditions": []}, {}, False),
        ({"op": "all", "conditions": []}, {}, True),
    ],
)
def test_three_valued_conditions(condition, values, expected):
    parsed = TypeAdapter(Condition).validate_python(condition)
    assert evaluate_condition(parsed, values.get) is expected
    assert evaluate_condition(parsed, values.get, depth=9) is None


def test_unsupported_presentation_uses_attribute_fallback():
    document = PresentationEnvelope(schema_version=2, requires=[])
    assert not group_write_blocked(document, "target", lambda _: None)
