import re
from typing import Any

import pytest
from devices import app  # ty: ignore[unresolved-import]
from storage.core_file_storage import CoreFileStorage
from typer.testing import CliRunner

from .conftest import TEST_DRIVER

runner = CliRunner()


def test_list_devices(mock_core_file_storage: CoreFileStorage) -> None:
    result = runner.invoke(app, ["list"], obj={"repository": mock_core_file_storage})
    assert result.exit_code == 0, result.exception
    assert "test_device" in result.output


def test_read_device(
    monkeypatch: pytest.MonkeyPatch,
    mock_core_file_storage: CoreFileStorage,
    open_meteo_server: Any,
) -> None:
    patched_driver = TEST_DRIVER.copy()
    patched_driver["env"]["base_url"] = open_meteo_server.url_for("") + "/v1/forecast"  # ty:ignore[invalid-assignment]
    monkeypatch.setattr(
        mock_core_file_storage.drivers,
        "read",
        lambda _: patched_driver,
    )
    result = runner.invoke(
        app,
        ["read", "test_device"],
        obj={"repository": mock_core_file_storage},
    )
    assert result.exit_code == 0
    output_pattern = r"temperature"
    print(result.output)
    assert re.search(output_pattern, result.output), (
        "Expected output not found in the result"
    )
