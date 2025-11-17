import pytest

from core.transports.http_transport.http_address import (
    HttpAddress,
    render_endpoint,
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
def test_parse_http_address_from_string(address, method, endpoint) -> None:  # noqa: ANN001
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


@pytest.mark.parametrize(
    ("endpoint", "config", "expected"),
    [
        (
            "{base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true",
            {
                "lattitude": 48.866,
                "longitude": 2.333,
                "base_url": "https://api.open-meteo.com/v1/forecast",
            },
            "https://api.open-meteo.com/v1/forecast/?latitude=48.866&longitude=2.333&current_weather=true",
        ),
    ],
)
def test_render_endpoint(endpoint, config, expected) -> None:  # noqa: ANN001
    assert render_endpoint(endpoint, config) == expected
