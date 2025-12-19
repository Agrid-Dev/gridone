from typing import Any

import pytest
from core.value_adapters.factory import ValueAdapterSpec, build_value_adapter


@pytest.mark.parametrize(
    ("specs", "input_value", "output_expected"),
    [
        ([ValueAdapterSpec(adapter="identity", argument="")], 1, 1),
        ([ValueAdapterSpec(adapter="scale", argument=0.1)], 10, 1),
        (
            [
                ValueAdapterSpec(adapter="scale", argument=0.1),
                ValueAdapterSpec(adapter="scale", argument=0.1),
            ],
            10,
            0.1,
        ),
        (
            [
                ValueAdapterSpec(adapter="json_pointer", argument="/my/nested/value"),
                ValueAdapterSpec(adapter="scale", argument=0.1),
            ],
            {"my": {"nested": {"value": 10}}},
            1,
        ),
        (
            [
                ValueAdapterSpec(adapter="json_pointer", argument="/my/nested/value"),
                ValueAdapterSpec(adapter="scale", argument=0.1),
                ValueAdapterSpec(adapter="bool_format", argument="0/1"),
            ],
            {"my": {"nested": {"value": 10}}},
            True,
        ),
        ([], 1, 1),
    ],
)
def test_build_value_adapter(
    specs: list[ValueAdapterSpec], input_value: Any, output_expected: Any
) -> None:
    adapter = build_value_adapter(specs)
    assert adapter.decode(input_value) == output_expected


def test_build_value_adapter_invalid_adapter():
    with pytest.raises(ValueError):  # noqa: PT011
        build_value_adapter([ValueAdapterSpec(adapter="unknown", argument="arg")])
