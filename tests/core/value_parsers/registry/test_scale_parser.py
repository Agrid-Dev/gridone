import pytest

from core.value_parsers.registry.scale_parser import ScaleParser


@pytest.mark.parametrize(
    ("scale", "expected_scale"),
    [
        ("0.1", 0.1),
        (0.1, 0.1),
    ],
)
def test_create_scale_parser(scale: float | str, expected_scale: float) -> None:
    sp = ScaleParser(scale)  # ty: ignore[invalid-argument-type]
    assert sp.scale == expected_scale
