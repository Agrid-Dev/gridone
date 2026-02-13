import re
from typing import Any

import pytest
from devices_manager import DevicesManager

from .conftest import TEST_DRIVER, TEST_TRANSPORT

try:
    from cli.devices import app  # ty: ignore[unresolved-import]
    from typer.testing import CliRunner
except ModuleNotFoundError:
    pytestmark = pytest.mark.skip(reason="CLI dependencies are not installed.")
    runner = None
else:
    runner = CliRunner()


def test_list_devices(seeded_dtos) -> None:
    assert runner is not None
    devices, drivers, transports = seeded_dtos
    dm = DevicesManager.from_dto(
        devices=devices,
        drivers=drivers,
        transports=transports,
    )
    result = runner.invoke(app, ["list"], obj={"dm": dm})
    assert result.exit_code == 0, result.exception
    assert "test_device" in result.output


def test_read_device(
    seeded_dtos,
    open_meteo_server: Any,
) -> None:
    assert runner is not None
    devices, _, _ = seeded_dtos
    patched_driver = TEST_DRIVER.model_copy(
        update={"env": {"base_url": open_meteo_server.url_for("") + "/v1/forecast"}}
    )
    dm = DevicesManager.from_dto(
        devices=devices,
        drivers=[patched_driver],
        transports=[TEST_TRANSPORT],
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
