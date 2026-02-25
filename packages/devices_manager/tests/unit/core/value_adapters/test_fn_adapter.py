import pytest
from devices_manager.core.value_adapters.fn_adapter import FnAdapter
from devices_manager.core.value_adapters.registry.byte_convert_adapter import (
    byte_convert_adapter,
)
from devices_manager.core.value_adapters.registry.scale_adapter import scale_adapter
from devices_manager.core.value_adapters.registry.slice_adapter import slice_adapter

times_two = FnAdapter[float, float](decoder=lambda x: x * 2, encoder=lambda x: x / 2)
square = FnAdapter[float, float](decoder=lambda x: x**2, encoder=lambda x: x**0.5)

plus_one_one_way = FnAdapter[float, float](decoder=lambda x: x + 1)


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
        slice_adapter("1:3")
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
