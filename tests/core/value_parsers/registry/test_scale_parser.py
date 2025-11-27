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


@pytest.mark.parametrize(
    ("input_value", "scale", "expected"), [(10, 0.1, 1), (10, 10, 100)]
)
def test_scale_parser_parse(input_value: float, scale: float, expected: float) -> None:
    assert ScaleParser(str(scale)).parse(input_value) == expected


@pytest.mark.parametrize(
    ("input_value", "scale", "expected"), [(10, 0.1, 100), (10, 10, 1)]
)
def test_scale_parser_reverse(
    input_value: float, scale: float, expected: float
) -> None:
    assert ScaleParser(str(scale)).revert(input_value) == expected
