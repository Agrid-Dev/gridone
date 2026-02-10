import pytest
from devices_manager.core.utils.cast.bool import cast_as_bool


@pytest.mark.parametrize(
    ("value", "expected"),
    [(True, True), (False, False), (1, True), (0, False), (1.0, True), (0.0, False)],
)
def test_cast_as_bool_valid_values(value, expected: bool) -> None:
    assert cast_as_bool(value) == expected


def test_cast_as_bool_invalid_values() -> None:
    for invalid_value in [2, -2, 4.0, "b"]:
        with pytest.raises(TypeError):
            cast_as_bool(invalid_value)
