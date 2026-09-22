"""Pure per-instance value tables: decode, encode and projection agree."""

import pytest

from devices_manager.core.device.value_mapping import (
    decode_mapping,
    encode_mapping,
    project_mapping,
)
from models.conditions import EvaluationContext
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
    projected = next(
        option
        for option in project_mapping(mapping, EvaluationContext(values.get))
        if option.value == 5
    )
    assert projected.available is available
    if available:
        assert encode_mapping(mapping, 5, EvaluationContext(values.get)) == 1
    else:
        with pytest.raises(WriteRejectedError):
            encode_mapping(mapping, 5, EvaluationContext(values.get))


def test_reserved_and_terminated_entries_remain_readable():
    mapping = table(stop_value=-1)
    values = {"first": -1, "second": 8}
    assert decode_mapping(mapping, 0, EvaluationContext(values.get)) == 0
    assert decode_mapping(mapping, 2, EvaluationContext(values.get)) == 8
    with pytest.raises(WriteRejectedError):
        encode_mapping(mapping, 8, EvaluationContext(values.get))
