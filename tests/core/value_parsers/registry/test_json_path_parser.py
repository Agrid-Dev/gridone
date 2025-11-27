from typing import Any

import pytest

from core.value_parsers.registry.json_path_parser import (
    json_path_parser,
)

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
    assert json_path_parser(data, json_path) == expected


def test_json_path_parser_raises_not_found() -> None:
    with pytest.raises(ValueError, match="Could not find value"):
        json_path_parser(TEST_DATA, '$.data[?(@.name == "UNKNOWN")].value')
