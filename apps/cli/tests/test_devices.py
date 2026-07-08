import re
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
import typer
from cli.devices import _coerce_write_value, app
from typer.testing import CliRunner

from devices_manager import DevicesService
from devices_manager.storage.memory import MemoryDevicesStorage
from devices_manager.types import DataType

from .conftest import TEST_DRIVER

runner = CliRunner()


def _seeded_build_storage(
    storage: MemoryDevicesStorage,
) -> Callable[[str | None], Awaitable[MemoryDevicesStorage]]:
    async def _build(_url: str | None) -> MemoryDevicesStorage:
        return storage

    return _build


@pytest_asyncio.fixture
async def devices_service(
    seeded_memory_storage: MemoryDevicesStorage,
) -> AsyncIterator[DevicesService]:
    with patch(
        "devices_manager.service.build_storage",
        _seeded_build_storage(seeded_memory_storage),
    ):
        svc = DevicesService(storage_url="memory://test")
        await svc.start()
    try:
        yield svc
    finally:
        await svc.stop()


def test_list_devices(devices_service: DevicesService) -> None:
    svc = devices_service
    with (
        patch("cli.service.DevicesService", return_value=svc),
        patch.object(svc, "load", AsyncMock()),
        patch.object(svc, "stop", AsyncMock()),
    ):
        result = runner.invoke(app, ["list"])
    assert result.exit_code == 0, result.exception
    assert "test_device" in result.output


@pytest_asyncio.fixture
async def devices_service_with_local_driver(
    seeded_memory_storage: MemoryDevicesStorage,
    open_meteo_server: Any,
) -> AsyncIterator[DevicesService]:
    patched_driver = TEST_DRIVER.model_copy(
        update={"env": {"base_url": open_meteo_server.url_for("") + "/v1/forecast"}}
    )
    await seeded_memory_storage.drivers.write(patched_driver.id, patched_driver)
    with patch(
        "devices_manager.service.build_storage",
        _seeded_build_storage(seeded_memory_storage),
    ):
        svc = DevicesService(storage_url="memory://test")
        await svc.start()
    try:
        yield svc
    finally:
        await svc.stop()


def test_read_device(devices_service_with_local_driver: DevicesService) -> None:
    svc = devices_service_with_local_driver
    with (
        patch("cli.service.DevicesService", return_value=svc),
        patch.object(svc, "load", AsyncMock()),
        patch.object(svc, "stop", AsyncMock()),
    ):
        result = runner.invoke(app, ["read", "test_device"])
    assert result.exit_code == 0, result.exception
    assert re.search(r"temperature", result.output), (
        "Expected output not found in the result"
    )
    # Streaming read ends with a timed summary line.
    assert re.search(r"attribute\(s\) read in", result.output), (
        "Expected summary line not found in the result"
    )


@pytest.mark.parametrize(
    ("raw", "data_type", "expected"),
    [
        ("cool", DataType.STRING, "cool"),
        ("21.5", DataType.FLOAT, 21.5),
        ("21", DataType.FLOAT, 21.0),
        ("3", DataType.INT, 3),
        ("1", DataType.BOOL, True),
        ("0", DataType.BOOL, False),
        ("true", DataType.BOOL, True),
        ("Off", DataType.BOOL, False),
    ],
)
def test_coerce_write_value(raw: str, data_type: DataType, expected: object) -> None:
    assert _coerce_write_value(raw, data_type) == expected


@pytest.mark.parametrize(
    ("raw", "data_type"),
    [
        ("cool", DataType.FLOAT),
        ("21.5", DataType.INT),
        ("maybe", DataType.BOOL),
    ],
)
def test_coerce_write_value_rejects_invalid(raw: str, data_type: DataType) -> None:
    with pytest.raises(typer.BadParameter):
        _coerce_write_value(raw, data_type)


# Driver carrying a string-valued attribute (like a thermostat `mode`) plus the
# float attribute from TEST_DRIVER, reusing the same read address for both.
_STRING_ATTR_DRIVER = TEST_DRIVER.model_copy(
    update={
        "attributes": [
            *TEST_DRIVER.attributes,
            type(TEST_DRIVER.attributes[0]).model_validate(
                {
                    "name": "mode",
                    "data_type": "str",
                    "read": TEST_DRIVER.attributes[0].read,
                }
            ),
        ]
    }
)


@pytest_asyncio.fixture
async def devices_service_with_string_attr(
    seeded_memory_storage: MemoryDevicesStorage,
) -> AsyncIterator[DevicesService]:
    await seeded_memory_storage.drivers.write(
        _STRING_ATTR_DRIVER.id, _STRING_ATTR_DRIVER
    )
    with patch(
        "devices_manager.service.build_storage",
        _seeded_build_storage(seeded_memory_storage),
    ):
        svc = DevicesService(storage_url="memory://test")
        await svc.start()
    try:
        yield svc
    finally:
        await svc.stop()


def test_write_string_attribute(
    devices_service_with_string_attr: DevicesService,
) -> None:
    """Regression: a string value ('cool') must reach the service untouched."""
    svc = devices_service_with_string_attr
    with (
        patch("cli.service.DevicesService", return_value=svc),
        patch.object(svc, "load", AsyncMock()),
        patch.object(svc, "stop", AsyncMock()),
        patch.object(svc, "write_device_attribute", AsyncMock()) as mock_write,
    ):
        result = runner.invoke(app, ["write", "test_device", "mode", "cool"])
    assert result.exit_code == 0, result.exception
    mock_write.assert_awaited_once_with("test_device", "mode", "cool")


def test_write_float_attribute_still_coerces(
    devices_service: DevicesService,
) -> None:
    svc = devices_service
    with (
        patch("cli.service.DevicesService", return_value=svc),
        patch.object(svc, "load", AsyncMock()),
        patch.object(svc, "stop", AsyncMock()),
        patch.object(svc, "write_device_attribute", AsyncMock()) as mock_write,
    ):
        result = runner.invoke(app, ["write", "test_device", "temperature", "21.5"])
    assert result.exit_code == 0, result.exception
    mock_write.assert_awaited_once_with("test_device", "temperature", 21.5)
