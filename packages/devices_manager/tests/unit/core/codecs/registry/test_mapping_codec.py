from typing import Any

import pytest

from devices_manager.core.codecs.registry.mapping_codec import mapping_codec

_MODBUS_MODES = {1: "heat", 2: "cool", 3: "fan", 4: "auto"}  # int → str
_LOCALE = {"chaleur": "heat", "froid": "cool"}  # str → str
_REMAP = {1: 10, 2: 20}  # int → int


@pytest.fixture
def mode_codec():
    return mapping_codec(_MODBUS_MODES)


# decode


@pytest.mark.parametrize(
    ("raw", "mapping", "expected"),
    [
        (1, _MODBUS_MODES, "heat"),
        (4, _MODBUS_MODES, "auto"),
        ("chaleur", _LOCALE, "heat"),
        ("froid", _LOCALE, "cool"),
        (1, _REMAP, 10),
    ],
)
def test_decode(raw: Any, mapping: dict, expected: Any) -> None:
    assert mapping_codec(mapping).decode(raw) == expected


# encode


@pytest.mark.parametrize(
    ("internal", "mapping", "expected"),
    [
        ("heat", _MODBUS_MODES, 1),
        ("auto", _MODBUS_MODES, 4),
        ("heat", _LOCALE, "chaleur"),
        ("cool", _LOCALE, "froid"),
        (10, _REMAP, 1),
    ],
)
def test_encode(internal: Any, mapping: dict, expected: Any) -> None:
    assert mapping_codec(mapping).encode(internal) == expected


# round-trip


@pytest.mark.parametrize("raw", [1, 2, 3, 4])
def test_round_trip(mode_codec, raw: int) -> None:
    assert mode_codec.encode(mode_codec.decode(raw)) == raw


# JSON string argument


def test_json_string_argument() -> None:
    codec = mapping_codec('{"1": "heat", "2": "cool"}')
    assert codec.decode(1) == "heat"
    assert codec.encode("heat") == 1


# validation


def test_invalid_json() -> None:
    with pytest.raises(ValueError, match="Invalid mapping argument"):
        mapping_codec("not json")


def test_non_dict_json() -> None:
    with pytest.raises(TypeError, match="JSON object"):
        mapping_codec('["heat", "cool"]')


def test_non_bijective_raises() -> None:
    with pytest.raises(ValueError, match="not bijective"):
        mapping_codec({1: "heat", 2: "heat"})


def test_unknown_decode_key(mode_codec) -> None:
    with pytest.raises(ValueError, match="No mapping found"):
        mode_codec.decode(99)


def test_unknown_encode_key(mode_codec) -> None:
    with pytest.raises(ValueError, match="No reverse mapping found"):
        mode_codec.encode("unknown")


def test_value_options_exposed_on_codec() -> None:
    codec = mapping_codec({1: "heat", 2: "cool"})
    assert codec.value_options == ["heat", "cool"]
