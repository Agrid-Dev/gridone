import pytest
from devices_manager.core.value_adapters.registry.slice_adapter import (
    slice_adapter,
)
from models.errors import InvalidError


@pytest.mark.parametrize("argument", ["1:", ":3", "1:2", "1:2:3", ":", " 1 : 3"])
def test_valid_arguments(argument):
    adapter = slice_adapter(argument)
    assert callable(adapter.decode)


@pytest.mark.parametrize("argument", ["", "a:b:c", "invalid"])
def test_invalid_arguments(argument):
    with pytest.raises(InvalidError, match="Invalid slice format"):
        slice_adapter(argument)


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
def test_slice_adapter_decoding(argument, input_value, expected):
    adapter = slice_adapter(argument)
    result = adapter.decode(input_value)
    assert result == expected
