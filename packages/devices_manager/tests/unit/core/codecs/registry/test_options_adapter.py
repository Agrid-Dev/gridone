import pytest

from devices_manager.core.codecs.factory import CodecSpec, build_codec
from devices_manager.core.codecs.registry.options_adapter import options_adapter
from models.errors import InvalidError


@pytest.mark.parametrize(
    ("value", "options"),
    [
        ("heat", ["heat", "cool", "fan", "auto"]),
        ("auto", ["heat", "cool", "fan", "auto"]),
        (1, [1, 2, 3]),
        (2, [1, 2, 3]),
    ],
)
def test_encode_valid_value_passes_through(value, options) -> None:
    assert options_adapter(options).encode(value) == value


@pytest.mark.parametrize(
    ("value", "options"),
    [
        ("dry", ["heat", "cool", "fan", "auto"]),
        (99, [1, 2, 3]),
    ],
)
def test_encode_invalid_value_raises(value, options) -> None:
    with pytest.raises(InvalidError, match="not in options"):
        options_adapter(options).encode(value)


@pytest.mark.parametrize(
    ("value", "options"),
    [
        ("anything", ["heat", "cool"]),
        (42, [1, 2, 3]),
        (None, ["heat", "cool"]),
        ({"nested": "object"}, ["heat"]),
    ],
)
def test_decode_passes_anything_through(value, options) -> None:
    assert options_adapter(options).decode(value) == value


def test_registered_in_factory() -> None:
    codec = build_codec(
        [CodecSpec(name="options", argument=["heat", "cool", "fan", "auto"])]
    )
    assert codec.encode("heat") == "heat"
    with pytest.raises(InvalidError, match="not in options"):
        codec.encode("dry")
