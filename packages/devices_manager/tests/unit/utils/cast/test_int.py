import pytest
from devices_manager.utils.cast.int import cast_as_int


@pytest.mark.parametrize(
    ("value", "expected"), [(2, 2), (2.0, 2), (2.2, 2), (1.9, 2), ("2", 2), ("2.0", 2)]
)
def test_cast_as_int(value, expected: int):
    result = cast_as_int(value)
    assert isinstance(result, int)
    assert result == expected


@pytest.mark.parametrize(("value"), [(True), (False), ("string"), (""), ([1, 2, 3])])
def test_cast_as_int_raises_invalid_value(value):
    with pytest.raises(TypeError):
        cast_as_int(value)
