from typing import Any

import pytest
from devices_manager.core.value_adapters.registry.json_pointer_adapter import (
    json_pointer_adapter,
)


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
    adapter = json_pointer_adapter(json_pointer)
    assert adapter.decode(data) == expected
