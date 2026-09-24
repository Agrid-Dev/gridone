import pytest
from pydantic import ValidationError

from devices_manager.core.codecs.factory import CodecSpec, build_codec
from devices_manager.core.codecs.invalid_sample import InvalidSampleError
from devices_manager.core.codecs.registry.invalid_values_codec import (
    invalid_values_codec,
)


@pytest.mark.parametrize(
    ("codecs", "raw"),
    [
        (
            [
                CodecSpec(name="invalid_values", argument=[-2147483648]),
                CodecSpec(name="scale", argument=0.001),
            ],
            -2147483648,
        ),
        (
            [
                CodecSpec(name="scale", argument=0.001),
                CodecSpec(name="invalid_values", argument=[-2147483.648]),
            ],
            -2147483648,
        ),
        ([CodecSpec(name="invalid_values", argument=["TRISTATE_NA"])], "TRISTATE_NA"),
    ],
)
def test_sentinel_at_any_stage_is_explicitly_invalid(codecs, raw):
    with pytest.raises(InvalidSampleError):
        build_codec(codecs).decode(raw)


def test_real_negative_temperature_and_write_sentinel_are_preserved():
    codec = build_codec(
        [
            CodecSpec(name="invalid_values", argument=[-2147483648]),
            CodecSpec(name="scale", argument=0.001),
        ]
    )
    assert codec.decode(-12000) == -12
    assert codec.decode(-1) == -0.001
    assert codec.encode(-2147483.648) == -2147483648


def test_boolean_is_not_numeric_sentinel_and_options_exclude_unknown():
    assert invalid_values_codec([1]).decode(value=True) is True
    codec = build_codec(
        [
            CodecSpec(name="options", argument=["on", "off", "NA"]),
            CodecSpec(name="invalid_values", argument=["NA"]),
        ]
    )
    assert codec.value_options == ["on", "off"]


@pytest.mark.parametrize("sentinels", [[], [None], [{}], [float("inf")]])
def test_invalid_declarations_are_rejected(sentinels):
    with pytest.raises(ValidationError):
        invalid_values_codec(sentinels)
