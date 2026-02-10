import pytest
from devices_manager.core.transports.http_transport.http_address import (
    HttpAddress,
)


@pytest.mark.parametrize(
    ("address", "method", "endpoint"),
    [
        (
            "GET {base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true",  # noqa: E501
            "GET",
            "{base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true",
        ),
    ],
)
def test_parse_http_address_from_string(address, method, endpoint) -> None:
    result = HttpAddress.from_raw(address)
    assert result.method == method
    assert result.path == endpoint


@pytest.mark.parametrize(
    ("raw_address", "expected"),
    [
        (
            {"method": "GET", "path": "/my-value"},
            HttpAddress(
                method="GET",
                path="/my-value",  # no body
            ),
        ),
        (
            {"method": "POST", "path": "/show_data", "body": "dataname=Tsetpoint"},
            HttpAddress(
                method="POST",
                path="/show_data",
                body="dataname=Tsetpoint",  # with string body
            ),
        ),
        (
            {
                "method": "POST",
                "path": "/show_data",
                "body": {
                    "dataname": "Tsetpoint",
                },
            },
            HttpAddress(
                method="POST",
                path="/show_data",
                body={
                    "dataname": "Tsetpoint",  # with json body
                },
            ),
        ),
    ],
)
def test_parse_http_address_from_dict(raw_address: dict, expected: HttpAddress) -> None:
    assert HttpAddress.from_dict(raw_address) == expected


def test_http_address_id() -> None:
    address = HttpAddress(
        method="POST",
        path="/show_data",
        body={
            "dataname": "Tsetpoint",  # with json body
        },
    )
    assert isinstance(address.id, str)
    assert len(address.id) > 1
