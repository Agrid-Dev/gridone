from typing import Any

import pytest

from devices_manager.core.codecs.fn_codec import FnCodec
from devices_manager.core.codecs.registry.bool_format_adapter import (
    SUPPORTED_FORMAT,
    bool_format_adapter,
)


@pytest.fixture
def adapter() -> FnCodec:
    return bool_format_adapter(SUPPORTED_FORMAT)


def test_bool_format_parser_invalid_format():
    with pytest.raises(ValueError, match="Unsupported bool format"):
        bool_format_adapter("INVALID_FORMAT")


@pytest.mark.parametrize(("raw", "expected"), [(1, True), (0, False)])
def test_bool_format_parser_valid_input(
    adapter: FnCodec, raw: int, expected: bool
) -> None:
    decoded = adapter.decode(raw)
    assert decoded == expected
    assert adapter.encode(decoded) == raw


@pytest.mark.parametrize(("raw"), [(12.5), ("abc"), (None), (-1)])
def test_bool_format_invalid_input(adapter: FnCodec, raw: Any) -> None:
    with pytest.raises(TypeError):
        adapter.decode(raw)
