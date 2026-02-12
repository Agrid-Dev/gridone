import re
from typing import Any

from cli.devices import app  # ty: ignore[unresolved-import]
from devices_manager import DevicesManager
from devices_manager.storage import CoreFileStorage
from typer.testing import CliRunner

from .conftest import TEST_DRIVER

runner = CliRunner()


def test_list_devices(mock_core_file_storage: CoreFileStorage) -> None:
    dm = DevicesManager.from_dto(
        devices=mock_core_file_storage.devices.read_all(),
        drivers=mock_core_file_storage.drivers.read_all(),
        transports=mock_core_file_storage.transports.read_all(),
    )
    result = runner.invoke(app, ["list"], obj={"dm": dm})
    assert result.exit_code == 0, result.exception
    assert "test_device" in result.output


def test_read_device(
    mock_core_file_storage: CoreFileStorage,
    open_meteo_server: Any,
) -> None:
    patched_driver = TEST_DRIVER.model_copy(
        update={"env": {"base_url": open_meteo_server.url_for("") + "/v1/forecast"}}
    )
    dm = DevicesManager.from_dto(
        devices=mock_core_file_storage.devices.read_all(),
        drivers=[patched_driver],
        transports=mock_core_file_storage.transports.read_all(),
    )
    result = runner.invoke(
        app,
        ["read", "test_device"],
        obj={"dm": dm},
    )
    assert result.exit_code == 0
    output_pattern = r"temperature"
    print(result.output)
    assert re.search(output_pattern, result.output), (
        "Expected output not found in the result"
    )
