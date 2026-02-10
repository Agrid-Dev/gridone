import pytest
from devices_manager.core.utils.cast.float import cast_as_float


@pytest.mark.parametrize(("value", "expected"), [(2.0, 2.0), (2, 2.0), ("2.0", 2.0)])
def test_cast_as_float(value, expected: float) -> None:
    result = cast_as_float(value)
    assert isinstance(result, float)
    assert result == expected


@pytest.mark.parametrize(("value"), [(False), (True), ("string"), ("")])
def test_cast_as_float_invalid_value(value) -> None:
    with pytest.raises(TypeError):
        cast_as_float(value)
