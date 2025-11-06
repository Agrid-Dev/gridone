import pytest

from core.transports.http_transport.http_address import (
    parse_http_address,
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
def test_parse_http_address(address, method, endpoint) -> None:  # noqa: ANN001
    assert parse_http_address(address) == (method, endpoint)


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
