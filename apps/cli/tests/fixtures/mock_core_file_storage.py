from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from storage import CoreFileStorage

TEST_DEVICE = {
    "id": "test_device",
    "driver": "test_driver",
    "config": {"lattitude": 48.866667, "longitude": 2.333333},
}

TEST_DRIVER = {
    "name": "test_driver",
    "transport": "http",
    "device_config": [{"name": "lattitude"}, {"name": "longitude"}],
    "update_strategy": {"polling": "15min", "timeout": "5s"},
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
            "json_pointer": "/current_weather/wind_speed",
        },
    ],
}


@pytest.fixture
def mock_file_storage() -> CoreFileStorage:
    with TemporaryDirectory() as temp_dir:
        (Path(temp_dir) / "drivers").mkdir()
        (Path(temp_dir) / "devices").mkdir()
        (Path(temp_dir) / "transport_config").mkdir()
        core_file_storage = CoreFileStorage(Path(temp_dir))
        core_file_storage.devices.write(TEST_DEVICE["id"], TEST_DEVICE)  # ty:ignore[invalid-argument-type]
        core_file_storage.drivers.write(TEST_DRIVER["name"], TEST_DRIVER)  # ty:ignore[invalid-argument-type]
        return core_file_storage
