import pytest

from devices_manager.core.codecs.registry.bit_codec import bit_codec


@pytest.mark.parametrize("index", [-1, 16, 32])
def test_bit_codec_invalid_index(index: int) -> None:
    with pytest.raises(ValueError, match="bit index must be between 0 and 15"):
        bit_codec(index)


@pytest.mark.parametrize(
    ("index", "register", "expected"),
    [
        (0, 0b0000_0000_0000_0001, True),
        (0, 0b0000_0000_0000_0000, False),
        (2, 0b0000_0000_0000_0101, True),
        (1, 0b0000_0000_0000_0101, False),
        (8, 0b0000_0001_0000_0000, True),
        (15, 0b1000_0000_0000_0000, True),
        (15, 0b0111_1111_1111_1111, False),
        (0, 0xFFFF, True),
        (7, 0x0000, False),
    ],
)
def test_bit_codec_decode(index: int, register: int, expected: bool) -> None:
    assert bit_codec(index).decode(register) == expected
