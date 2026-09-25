"""Pure per-instance value tables: decode, encode and projection agree."""

import pytest

from devices_manager.core.device.value_mapping import (
    decode_mapping,
    encode_mapping,
    project_mapping,
)
from models.conditions import EvaluationContext, scalar_key
from models.errors import WriteRejectedError
from models.write_rules import ValueMapping


def table(**fields: object):
    return ValueMapping.model_validate(
        {
            "entries": [
                {"code": 0, "value": 0, "selectable": False},
                {"code": 1, "value": {"attribute": "first"}},
                {"code": 2, "value": {"attribute": "second"}},
            ],
            **fields,
        }
    )


@pytest.mark.parametrize(
    ("values", "policy", "available"),
    [
        ({"first": 5, "second": 6}, "reject", True),
        ({"first": 5, "second": 5}, "reject", False),
        ({"first": 5, "second": 5}, "first", True),
        ({"first": None, "second": 5}, "first", False),
        ({"first": 5, "second": None}, "first", True),
        ({"first": 5, "second": None}, "reject", False),
    ],
)
def test_projected_mapping_agrees_with_inverse(values, policy, available):
    mapping = table(duplicates=policy)
    projected = project_mapping(mapping, EvaluationContext(values.get))[scalar_key(5)]
    assert projected.available is available
    if available:
        assert encode_mapping(mapping, 5, EvaluationContext(values.get)) == 1
    else:
        with pytest.raises(WriteRejectedError):
            encode_mapping(mapping, 5, EvaluationContext(values.get))


def slots(**fields: object):
    return ValueMapping.model_validate(
        {
            "entries": [
                {"code": i, "value": {"attribute": f"slot_{i}"}} for i in range(3)
            ],
            "stop_value": "error",
            **fields,
        }
    )


def encoded(mapping, value, values) -> list[str]:
    try:
        encode_mapping(mapping, value, EvaluationContext(values.get))
    except WriteRejectedError as exc:
        return [reason.code for reason in exc.reasons]
    return []


@pytest.mark.parametrize(
    ("values", "policy", "value", "reasons"),
    [
        ({}, "first", "cool", ["unknown_dependencies"]),
        (
            {"slot_0": "fan", "slot_2": "error"},
            "first",
            "cool",
            ["unknown_dependencies"],
        ),
        (
            {"slot_0": "fan", "slot_2": "error"},
            "reject",
            "cool",
            ["unknown_dependencies"],
        ),
        (
            {"slot_0": "fan", "slot_1": "error"},
            "first",
            "cool",
            ["unavailable_mapping"],
        ),
        (
            {"slot_0": "fan", "slot_1": "heat"},
            "first",
            "cool",
            ["unknown_dependencies"],
        ),
        ({"slot_0": "fan", "slot_1": "heat"}, "first", "fan", []),
    ],
)
def test_projection_gives_the_reason_encoding_raises(values, policy, value, reasons):
    mapping = slots(duplicates=policy)
    context = EvaluationContext(values.get)
    projected = project_mapping(mapping, context, [value])[scalar_key(value)]
    assert [reason.code for reason in projected.reasons] == reasons
    assert encoded(mapping, value, values) == reasons
    assert projected.available is (not reasons)


def test_reserved_and_terminated_entries_remain_readable():
    mapping = table(stop_value=-1)
    values = {"first": -1, "second": 8}
    assert decode_mapping(mapping, 0, EvaluationContext(values.get)) == 0
    assert decode_mapping(mapping, 2, EvaluationContext(values.get)) == 8
    with pytest.raises(WriteRejectedError):
        encode_mapping(mapping, 8, EvaluationContext(values.get))
