from typing import Any

import pytest
from core.attribute import Attribute
from core.types import DataType


@pytest.mark.parametrize(
    ("data_type", "raw_value", "expected"),
    [
        (DataType.BOOL, 1, True),
        (DataType.BOOL, 0, False),
        (DataType.INT, "1", 1),
        (DataType.FLOAT, "2.4", 2.4),
    ],
)
def test_ensure_type(data_type: DataType, raw_value: Any, expected: Any):
    attribute = Attribute(
        name="my-attribute",
        data_type=data_type,
        read_write_modes={"read"},
        current_value=raw_value,
        last_updated=None,
    )
    assert attribute.current_value == expected


@pytest.mark.parametrize(
    ("data_type", "raw_value"),
    [
        (DataType.BOOL, 8),
        (DataType.INT, True),
        (DataType.FLOAT, True),
        (DataType.FLOAT, "abc"),
    ],
)
def test_ensure_type_invalid_value(data_type: DataType, raw_value: Any):
    with pytest.raises(TypeError):
        Attribute(
            name="my-attribute",
            data_type=data_type,
            read_write_modes={"read"},
            current_value=raw_value,
            last_updated=None,
        )
