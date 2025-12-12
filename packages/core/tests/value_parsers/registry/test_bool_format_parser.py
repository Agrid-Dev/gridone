from typing import Any

import pytest
from core.value_parsers.registry.bool_format_parser import (
    SUPPORTED_FORMAT,
    BoolFormatParser,
)


def test_bool_format_parser_invalid_format():
    with pytest.raises(ValueError, match="Unsupported bool format"):
        BoolFormatParser("INVALID_FORMAT")


@pytest.mark.parametrize(("raw", "expected"), [(1, True), (0, False)])
def test_bool_format_parser_valid_input(raw: int, expected: bool) -> None:
    bfp = BoolFormatParser(SUPPORTED_FORMAT)
    parsed = bfp.parse(raw)
    assert parsed == expected
    assert bfp.revert(parsed) == raw


@pytest.mark.parametrize(("raw"), [(12.5), ("abc"), (None), (-1)])
def test_bool_format_invalid_input(raw: Any) -> None:
    bfp = BoolFormatParser(SUPPORTED_FORMAT)
    with pytest.raises(TypeError):
        bfp.parse(raw)
