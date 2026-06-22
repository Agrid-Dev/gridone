import pytest

from devices_manager.core.codecs.registry.offset_codec import offset_codec


@pytest.mark.parametrize(
    ("input_value", "offset", "expected"),
    [(10, 5, 15), (10, -5, 5), (0, 2, 2), (28.5, -28.5, 0)],
)
def test_offset_decode(input_value: float, offset: float, expected: float) -> None:
    codec = offset_codec(offset)
    assert codec.decode(input_value) == expected


@pytest.mark.parametrize(
    ("input_value", "offset", "expected"),
    [(15, 5, 10), (5, -5, 10), (2, 2, 0)],
)
def test_offset_encode(input_value: float, offset: float, expected: float) -> None:
    codec = offset_codec(offset)
    assert codec.encode(input_value) == expected
