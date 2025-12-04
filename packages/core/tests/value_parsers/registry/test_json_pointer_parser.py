from typing import Any

import pytest
from core.value_parsers.registry.json_pointer_parser import (
    JsonPointerParser,
    is_valid_json_pointer,
)


@pytest.mark.parametrize(
    ("pointer", "is_valid"),
    [
        ("a", False),
        ("/a", True),
        ("", True),
        ("/", True),
        ("/a/b", True),
        ("//a", True),
        ("/a//b", True),
    ],
)
def test_is_valid_json_pointer(pointer: str, is_valid: bool) -> None:
    assert is_valid_json_pointer(pointer)[0] == is_valid


@pytest.mark.parametrize(
    ("data", "json_pointer", "expected"),
    [
        ({"a": 1, "b": {"c": 2}}, "/a", 1),
        ({"a": 1, "b": {"c": 2}}, "/b/c", 2),
        ({"x": {"y": {"z": "value"}}}, "/x/y/z", "value"),
        ({"list": [10, 20, 30]}, "/list/1", 20),
        (
            {"nested": {"list": [{"key": "val1"}, {"key": "val2"}]}},
            "/nested/list/0/key",
            "val1",
        ),
    ],
)
def test_json_pointer_parser(data: dict, json_pointer: str, expected: Any) -> None:
    parser = JsonPointerParser(json_pointer)
    assert parser.parse(data) == expected
