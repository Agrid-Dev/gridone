import pytest
from core.value_adapters.registry.scale_adapter import scale_adapter


@pytest.mark.parametrize(
    ("input_value", "scale", "expected"), [(10, 0.1, 1), (10, 10, 100)]
)
def test_scale_parser_parse(input_value: float, scale: float, expected: float) -> None:
    adapter = scale_adapter(scale)
    assert adapter.decode(input_value) == expected


@pytest.mark.parametrize(
    ("input_value", "scale", "expected"), [(10, 0.1, 100), (10, 10, 1)]
)
def test_scale_parser_reverse(
    input_value: float, scale: float, expected: float
) -> None:
    adapter = scale_adapter(scale)
    assert adapter.encode(input_value) == expected
