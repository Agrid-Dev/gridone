import pytest
from devices_manager.core.utils.cast import cast
from devices_manager.types import AttributeValueType, DataType


@pytest.mark.parametrize(
    ("raw_value", "data_type", "expected"),
    [
        (True, DataType.BOOL, True),
        (False, DataType.BOOL, False),
        (1, DataType.BOOL, True),
        (1, DataType.INT, 1),
        (1, DataType.FLOAT, 1.0),
        (1.4, DataType.INT, 1),
    ],
)
def test_cast(raw_value, data_type: DataType, expected: AttributeValueType) -> None:
    result = cast(raw_value, data_type)
    assert isinstance(result, type(expected))
    assert result == expected
