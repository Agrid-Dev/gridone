from typing import Any

import pytest
from pydantic import ValidationError

from devices_manager.core.codecs.factory import (
    CodecSpec,
    build_codec,
    codec_spec_from_raw,
)
from models.errors import InvalidError


@pytest.mark.parametrize(
    ("specs", "input_value", "output_expected"),
    [
        ([CodecSpec(name="identity", argument="")], 1, 1),
        ([CodecSpec(name="scale", argument=0.1)], 10, 1),
        (
            [CodecSpec(name="byte_frame", argument="11 05 00 13 00 55 20")],
            bytes([0x11, 0x05, 0x00, 0x13, 0x00, 0x55, 0x20, 0x01]),
            1,
        ),
        (
            [
                CodecSpec(name="scale", argument=0.1),
                CodecSpec(name="scale", argument=0.1),
            ],
            10,
            0.1,
        ),
        (
            [
                CodecSpec(name="json_pointer", argument="/my/nested/value"),
                CodecSpec(name="scale", argument=0.1),
            ],
            {"my": {"nested": {"value": 10}}},
            1,
        ),
        (
            [
                CodecSpec(name="json_pointer", argument="/my/nested/value"),
                CodecSpec(name="scale", argument=0.1),
                CodecSpec(name="bool_format", argument="0/1"),
            ],
            {"my": {"nested": {"value": 10}}},
            True,
        ),
        ([], 1, 1),
        (
            [CodecSpec(name="mapping", argument={1: "heat", 2: "cool"})],
            1,
            "heat",
        ),
        (
            [CodecSpec(name="knx_dpt", argument="9.001")],
            [0x0C, 0x65],
            22.5,
        ),
    ],
)
def test_build_codec(
    specs: list[CodecSpec], input_value: Any, output_expected: Any
) -> None:
    adapter = build_codec(specs)
    assert adapter.decode(input_value) == output_expected


def test_build_codec_invalid_adapter():
    with pytest.raises(ValidationError, match="not supported"):
        build_codec([CodecSpec(name="unknown", argument="arg")])


def test_build_codec_wrong_arg_type():
    with pytest.raises(InvalidError, match="expects argument of type"):
        build_codec([CodecSpec(name="scale", argument={1: 2})])


@pytest.mark.parametrize(("raw"), [({"json_pointer": "/path/to/value"})])
def test_codec_spec_from_raw(raw: dict[str, str]):
    spec = codec_spec_from_raw(raw)
    assert spec.name == next(iter(raw.keys()))
    assert spec.argument == next(iter(raw.values()))


@pytest.mark.parametrize(
    ("raw"), [({}), ({"json_pointer": "/path/to/value", "extra": "not permitted"})]
)
def test_codec_spec_from_raw_invalid_input(raw: dict) -> None:
    with pytest.raises(InvalidError):
        codec_spec_from_raw(raw)
