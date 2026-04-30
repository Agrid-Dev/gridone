import re
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any
from unittest.mock import patch

import pytest_asyncio
from cli.devices import app
from typer.testing import CliRunner

from devices_manager import DevicesService
from devices_manager.storage.memory import MemoryDevicesStorage

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
    result = runner.invoke(app, ["list"], obj={"dm": devices_service})
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
    result = runner.invoke(
        app,
        ["read", "test_device"],
        obj={"dm": devices_service_with_local_driver},
    )
    assert result.exit_code == 0
    assert re.search(r"temperature", result.output), (
        "Expected output not found in the result"
    )
