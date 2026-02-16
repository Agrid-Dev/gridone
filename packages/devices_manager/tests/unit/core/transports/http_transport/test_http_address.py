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
            "http://{base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true",
        ),
        (
            "GET localhost:8080/v1",
            "GET",
            "http://localhost:8080/v1",
        ),
        (
            "POST 192.168.1.100:8080/api",
            "POST",
            "http://192.168.1.100:8080/api",
        ),
        (
            "GET http://localhost:8080/v1",
            "GET",
            "http://localhost:8080/v1",
        ),
        (
            "GET https://example.com/api",
            "GET",
            "https://example.com/api",
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


def test_http_address_defaults_scheme_when_missing() -> None:
    address = HttpAddress(method="GET", path="localhost:8080/v1")
    assert address.path == "http://localhost:8080/v1"


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
