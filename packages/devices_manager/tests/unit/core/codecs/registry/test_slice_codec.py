import pytest

from devices_manager.core.codecs.registry.slice_codec import (
    slice_codec,
)
from models.errors import InvalidError


@pytest.mark.parametrize("argument", ["1:", ":3", "1:2", "1:2:3", ":", " 1 : 3"])
def test_valid_arguments(argument):
    codec = slice_codec(argument)
    assert callable(codec.decode)


@pytest.mark.parametrize("argument", ["", "a:b:c", "invalid"])
def test_invalid_arguments(argument):
    with pytest.raises(InvalidError, match="Invalid slice format"):
        slice_codec(argument)


@pytest.mark.parametrize(
    ("argument", "input_value", "expected"),
    [
        ("1:3", b"\x01\x02\x03\x04", b"\x02\x03"),
        ("1:3", [10, 20, 30, 40], [20, 30]),
        ("1:", [10, 20, 30, 40], [20, 30, 40]),
        (":2", [10, 20, 30, 40], [10, 20]),
        ("::2", [10, 20, 30, 40], [10, 30]),
        ("1:4", "hello", "ell"),
        ("0:5:2", "abcdefg", "ace"),
    ],
)
def test_slice_codec_decoding(argument, input_value, expected):
    codec = slice_codec(argument)
    result = codec.decode(input_value)
    assert result == expected
