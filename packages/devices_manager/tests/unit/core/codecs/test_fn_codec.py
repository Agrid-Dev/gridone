import pytest

from devices_manager.core.codecs.fn_codec import FnCodec
from devices_manager.core.codecs.registry.byte_convert_adapter import (
    byte_convert_adapter,
)
from devices_manager.core.codecs.registry.mapping_adapter import mapping_adapter
from devices_manager.core.codecs.registry.options_adapter import options_adapter
from devices_manager.core.codecs.registry.scale_adapter import scale_adapter
from devices_manager.core.codecs.registry.slice_adapter import slice_adapter

times_two = FnCodec[float, float](decoder=lambda x: x * 2, encoder=lambda x: x / 2)
square = FnCodec[float, float](decoder=lambda x: x**2, encoder=lambda x: x**0.5)

plus_one_one_way = FnCodec[float, float](decoder=lambda x: x + 1)


def test_add_fn_adapter():
    combined = times_two + square
    start = 2
    decoded = combined.decode(start)
    assert decoded == (start * 2) ** 2
    assert combined.encode(decoded) == start


def test_default_encoder_identity():
    combined = times_two + plus_one_one_way
    start = 2
    decoded = combined.decode(start)
    assert decoded == 5  # (2*2)+1
    assert combined.encode(decoded) == 2.5  # (5/2)


# Adapters pipelines - testing composition of multiple adapters

_ELSYS_PAYLOAD = bytes(
    [
        0x01,
        0x08,
        0xCE,  # temperature: int16 2254 => 22.54 °C
        0x02,
        0x32,  # humidity: uint8 50
        0x04,
        0x08,
        0xE8,  # co2: uint16 2280
        0x05,
        0x00,  # motion: uint8 0
        0x06,
        0x00,
        0x16,  # light: uint16 22
        0x07,
        0x06,
        0xBE,  # battery: uint16 1726 mV
    ]
)


def test_byte_slice_then_byte_convert_temperature() -> None:
    pipeline = (
        slice_adapter("1:3")  # ty: ignore[unsupported-operator]
        + byte_convert_adapter("int16 big_endian")
        + scale_adapter(0.01)
    )
    assert pipeline.decode(_ELSYS_PAYLOAD) == pytest.approx(22.54)


def test_byte_slice_then_byte_convert_humidity() -> None:
    pipeline = slice_adapter("4:5") + byte_convert_adapter("uint8")
    assert pipeline.decode(_ELSYS_PAYLOAD) == 50


def test_byte_slice_then_byte_convert_co2() -> None:
    pipeline = slice_adapter("6:8") + byte_convert_adapter("uint16 big_endian")
    assert pipeline.decode(_ELSYS_PAYLOAD) == 2280


def test_value_options_transformed_through_downstream_codec() -> None:
    # options=[1,2,3] followed by scale(2): internal values are [2,4,6]
    pipeline = options_adapter([1, 2, 3]) + scale_adapter(2)  # ty: ignore[unsupported-operator]
    assert pipeline.value_options == [2, 4, 6]


def test_value_options_from_mapping_transformed_through_downstream_codec() -> None:
    # mapping {1->10, 2->20} followed by scale(0.1): internal values are [1.0, 2.0]
    pipeline = mapping_adapter({1: 10, 2: 20}) + scale_adapter(0.1)
    assert pipeline.value_options == pytest.approx([1.0, 2.0])


def test_value_options_unchanged_when_enumerating_codec_is_last() -> None:
    # scale then options: options are already in final internal space
    pipeline = scale_adapter(2) + options_adapter([1, 2, 3])  # ty: ignore[unsupported-operator]
    assert pipeline.value_options == [1, 2, 3]


def test_value_options_none_for_non_enumerating_chain() -> None:
    pipeline = scale_adapter(2) + scale_adapter(3)
    assert pipeline.value_options is None
