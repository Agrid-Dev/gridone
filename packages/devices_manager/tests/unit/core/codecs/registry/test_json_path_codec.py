import re
from typing import Any

import pytest

from devices_manager.core.codecs.registry.json_path_codec import (
    json_path_codec,
)
from models.errors import InvalidError

TEST_DATA = {
    "mac": "F0F5BD273F98",
    "ip": "10.125.0.120",
    "ts": "3126",
    "data": [
        {
            "name": "GitHash",
            "type": "DATA_TYPE_CHAR",
            "value": "8626657_NORMAL",
        },
        {
            "name": "Timestamp_UTC",
            "type": "DATA_TYPE_INT32",
            "value": 3126,
        },
        {
            "name": "State",
            "type": "DATA_TYPE_BOOL",
            "value": False,
        },
        {
            "name": "HVAC_Mode",
            "type": "DATA_TYPE_INT32",
            "value": 1,
        },
        {
            "name": "Tsetpoint",
            "type": "DATA_TYPE_FXP1000",
            "value": 26.0,
        },
        {
            "name": "Temperature",
            "type": "DATA_TYPE_FXP1000",
            "value": 25.369,
        },
        {
            "name": "Humidity",
            "type": "DATA_TYPE_FXP1000",
            "value": 30.136,
        },
        {
            "name": "Occupancy",
            "type": "DATA_TYPE_TRISTATE_BOOL",
            "value": "TRISTATE_FALSE",
        },
    ],
}


@pytest.mark.parametrize(
    (
        "data",
        "json_path",
        "expected",
    ),
    [
        (TEST_DATA, '$.data[?(@.name == "Temperature")].value', 25.369),
        (TEST_DATA, '$.data[?(@.name == "Tsetpoint")].value', 26.0),
        (TEST_DATA, '$.data[?(@.name == "State")].value', False),
        (TEST_DATA, '$.data[?(@.name == "Occupancy")].value', "TRISTATE_FALSE"),
    ],
)
def test_json_path_parser(data: dict, json_path: str, expected: Any) -> None:
    codec = json_path_codec(json_path)
    assert codec.decode(data) == expected


def test_json_path_parser_raises_not_found() -> None:
    codec = json_path_codec('$.data[?(@.name == "UNKNOWN")].value')
    with pytest.raises(ValueError, match="Could not find value"):
        codec.decode(TEST_DATA)


def test_invalid_expression_is_rejected_when_the_codec_is_built() -> None:
    with pytest.raises(InvalidError, match="json_path"):
        json_path_codec("$.data[?(")


def test_codec_decodes_a_json_string_payload() -> None:
    codec = json_path_codec('$.data[?(@.name == "Temperature")].value')

    payload = (
        '{"data": [{"name": "Other", "value": 1},'
        ' {"name": "Temperature", "value": 21.5}]}'
    )
    assert codec.decode(payload) == 21.5


def test_not_found_error_quotes_the_expression_as_written() -> None:
    expression = '$.data[?(@.name == "Missing")].value'
    codec = json_path_codec(expression)

    with pytest.raises(ValueError, match=re.escape(expression)):
        codec.decode('{"data": []}')
