from collections.abc import Generator
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from storage import CoreFileStorage

TEST_DEVICE = {
    "id": "test_device",
    "driver": "test_driver",
    "transport_id": "http_transport",
    "config": {"lattitude": 48.866667, "longitude": 2.333333},
}

TEST_DRIVER = {
    "id": "test_driver",
    "transport": "http",
    "device_config": [{"name": "lattitude"}, {"name": "longitude"}],
    "update_strategy": {"polling": "15min", "timeout": "5s"},
    "env": {"base_url": "https://api.open-meteo.com/v1/forecast"},
    "attributes": [
        {
            "name": "temperature",
            "data_type": "float",
            "read": "GET ${base_url}/?latitude=${lattitude}&longitude=${longitude}&current_weather=true",  # noqa: E501
            "json_pointer": "/current_weather/temperature",
        },
        {
            "name": "wind_speed",
            "data_type": "float",
            "read": "GET ${base_url}/?latitude=${lattitude}&longitude=${longitude}&current_weather=true",  # noqa: E501
            "json_pointer": "/current_weather/windspeed",
        },
    ],
}

TEST_TRANSPORT = {"id": "http_transport", "protocol": "http", "config": {}}


@pytest.fixture
def mock_core_file_storage() -> Generator[CoreFileStorage]:
    with TemporaryDirectory() as temp_dir:
        (Path(temp_dir) / "devices").mkdir()
        (Path(temp_dir) / "drivers").mkdir()
        (Path(temp_dir) / "transports").mkdir()
        core_file_storage = CoreFileStorage(Path(temp_dir))
        core_file_storage.devices.write(TEST_DEVICE["id"], TEST_DEVICE)  # ty:ignore[invalid-argument-type]
        core_file_storage.drivers.write(TEST_DRIVER["id"], TEST_DRIVER)  # ty:ignore[invalid-argument-type]
        core_file_storage.transports.write(TEST_TRANSPORT["id"], TEST_TRANSPORT)  # ty:ignore[invalid-argument-type]

        yield core_file_storage


OPEN_METEO_RESPONSE = {
    "latitude": 48.86,
    "longitude": 2.3399997,
    "generationtime_ms": 0.053048133850097656,
    "utc_offset_seconds": 0,
    "timezone": "GMT",
    "timezone_abbreviation": "GMT",
    "elevation": 50.0,
    "current_weather_units": {
        "time": "iso8601",
        "interval": "seconds",
        "temperature": "°C",
        "windspeed": "km/h",
        "winddirection": "°",
        "is_day": "",
        "weathercode": "wmo code",
    },
    "current_weather": {
        "time": "2025-12-13T00:00",
        "interval": 900,
        "temperature": 9.5,
        "windspeed": 2.5,
        "winddirection": 135,
        "is_day": 0,
        "weathercode": 45,
    },
}


@pytest.fixture
def open_meteo_server(httpserver):  # noqa: ANN001, ANN201
    httpserver.expect_request("/v1/forecast/", method="GET").respond_with_json(
        OPEN_METEO_RESPONSE
    )
    httpserver.expect_request("/", method="GET").respond_with_json(OPEN_METEO_RESPONSE)

    return httpserver
