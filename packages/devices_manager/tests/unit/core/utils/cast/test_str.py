import pytest
from devices_manager.core.utils.cast.str import cast_as_str


@pytest.mark.parametrize(("value", "expected"), [("abc", "abc"), ("", ""), (1, "1")])
def test_cast_as_str(value, expected: str) -> None:
    result = cast_as_str(value)
    assert isinstance(result, str)
    assert result == expected
