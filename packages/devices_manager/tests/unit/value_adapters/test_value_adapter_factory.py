from typing import Any

import pytest
from devices_manager.value_adapters.factory import (
    ValueAdapterSpec,
    build_value_adapter,
    spec_from_raw,
)


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
    with pytest.raises(ValueError, match="not supported"):
        build_value_adapter([ValueAdapterSpec(adapter="unknown", argument="arg")])


@pytest.mark.parametrize(("raw"), [({"json_pointer": "/path/to/value"})])
def test_spec_from_raw(raw: dict[str, str]):
    spec = spec_from_raw(raw)
    assert spec.adapter == next(iter(raw.keys()))
    assert spec.argument == next(iter(raw.values()))


@pytest.mark.parametrize(
    ("raw"), [({}), ({"json_pointer": "/path/to/value", "extra": "not permitted"})]
)
def test_spec_from_raw_invalid_input(raw: dict) -> None:
    with pytest.raises(ValueError):  # noqa: PT011
        spec_from_raw(raw)
