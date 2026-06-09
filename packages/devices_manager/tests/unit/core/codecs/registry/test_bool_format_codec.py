from typing import Any

import pytest

from devices_manager.core.codecs.fn_codec import FnCodec
from devices_manager.core.codecs.registry.bool_format_codec import (
    SUPPORTED_FORMAT,
    bool_format_codec,
)


@pytest.fixture
def codec() -> FnCodec:
    return bool_format_codec(SUPPORTED_FORMAT)


def test_bool_format_parser_invalid_format():
    with pytest.raises(ValueError, match="Unsupported bool format"):
        bool_format_codec("INVALID_FORMAT")


@pytest.mark.parametrize(("raw", "expected"), [(1, True), (0, False)])
def test_bool_format_parser_valid_input(
    codec: FnCodec, raw: int, expected: bool
) -> None:
    decoded = codec.decode(raw)
    assert decoded == expected
    assert codec.encode(decoded) == raw


@pytest.mark.parametrize(("raw"), [(12.5), ("abc"), (None), (-1)])
def test_bool_format_invalid_input(codec: FnCodec, raw: Any) -> None:
    with pytest.raises(TypeError):
        codec.decode(raw)
