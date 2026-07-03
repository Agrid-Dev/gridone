"""Service-boundary tests for the single-phase, read-only DevicesService load.

Covers the AGR-834 read-only-load acceptance criteria: hydrating from a
populated backend performs zero writes, storage and registries are built once
in ``load()`` (no ``set_storage`` swap), and ``load()`` starts no background
work.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio

from devices_manager import DevicesService
from devices_manager.core.device import Attribute
from devices_manager.core.device_registry import DeviceRegistry
from devices_manager.core.driver_registry import DriverRegistry
from devices_manager.core.transport_registry import TransportRegistry
from devices_manager.dto import (
    Device,
    PhysicalDeviceCreate,
    TransportCreate,
    driver_to_public,
)
from devices_manager.types import DataType, DeviceKind, TransportProtocols
from models.errors import StorageNotInitializedError, UnsupportedStorageError

if TYPE_CHECKING:
    from pathlib import Path

    from devices_manager.dto import DriverSpec

_MUTATING_METHODS = {"write", "delete", "set_tag", "delete_tag", "save_attribute"}


def _snapshot_files(root: Path) -> dict[Path, tuple[bytes, int]]:
    """Map every yaml file to its bytes and mtime, to detect any write."""
    return {
        path: (path.read_bytes(), path.stat().st_mtime_ns)
        for path in sorted(root.rglob("*.yaml"))
    }


def _storage_mock(
    *,
    devices: list[Device] | None = None,
    drivers: list[DriverSpec] | None = None,
) -> AsyncMock:
    """An ``AsyncMock`` standing in for ``DevicesManagerStorage``."""
    storage = AsyncMock()
    storage.devices.read_all.return_value = devices or []
    storage.drivers.read_all.return_value = drivers or []
    storage.transports.read_all.return_value = []
    return storage


def _assert_no_mutating_call(storage: AsyncMock) -> None:
    mutating = [
        call
        for call in storage.mock_calls
        if call[0].split(".")[-1] in _MUTATING_METHODS
    ]
    assert mutating == []


def _virtual_device_dto(device_id: str = "vd1") -> Device:
    return Device(
        id=device_id,
        kind=DeviceKind.VIRTUAL,
        name="Virtual Sensor",
        type="sensor",
        attributes={
            "value": Attribute.create("value", DataType.FLOAT, {"read", "write"}),
        },
        is_faulty=False,
    )


@pytest_asyncio.fixture
async def seeded_yaml_db(tmp_path: Path, driver) -> tuple[str, dict[str, str]]:
    """A ``yaml:`` DB dir seeded with one transport, one driver and one device."""
    url = f"yaml:{tmp_path}"
    svc = DevicesService(url)
    await svc.load()
    transport = await svc.add_transport(
        TransportCreate(
            name="Seed Transport",
            protocol=TransportProtocols.HTTP,
            config={},  # ty: ignore[invalid-argument-type]
        )
    )
    await svc.add_driver(driver_to_public(driver))
    device = await svc.add_device(
        PhysicalDeviceCreate(
            name="Seed Device",
            driver_id=driver.id,
            transport_id=transport.id,
            config={"some_id": "abc"},
        )
    )
    await svc.stop()
    ids = {
        "transport_id": transport.id,
        "driver_id": driver.id,
        "device_id": device.id,
    }
    return url, ids


class TestReadOnlyLoad:
    @pytest.mark.asyncio
    async def test_load_from_yaml_backend_performs_zero_writes(
        self, tmp_path: Path, seeded_yaml_db: tuple[str, dict[str, str]]
    ):
        url, ids = seeded_yaml_db
        snapshot = _snapshot_files(tmp_path)
        assert snapshot, "expected the seeded backend to contain yaml files"

        svc = DevicesService(url)
        await svc.load()
        try:
            assert ids["device_id"] in svc.device_ids
            assert ids["driver_id"] in svc.driver_ids
            assert ids["transport_id"] in svc.transport_ids
        finally:
            await svc.stop()

        assert _snapshot_files(tmp_path) == snapshot

    @pytest.mark.asyncio
    async def test_load_calls_no_mutating_storage_method(self, monkeypatch, driver):
        storage = _storage_mock(
            devices=[_virtual_device_dto()], drivers=[driver_to_public(driver)]
        )
        monkeypatch.setattr(
            "devices_manager.service.build_storage", AsyncMock(return_value=storage)
        )

        svc = DevicesService(storage_url="memory://test")
        await svc.load()

        assert svc.device_ids == {"vd1"}
        assert svc.driver_ids == {driver.id}
        _assert_no_mutating_call(storage)

    @pytest.mark.asyncio
    async def test_load_registers_no_persistence_listener(self, monkeypatch):
        """An attribute update after ``load()`` must not be persisted."""
        storage = _storage_mock(devices=[_virtual_device_dto()])
        monkeypatch.setattr(
            "devices_manager.service.build_storage", AsyncMock(return_value=storage)
        )

        svc = DevicesService(storage_url="memory://test")
        await svc.load()
        await svc.write_device_attribute("vd1", "value", 42.0)
        await asyncio.sleep(0.05)

        _assert_no_mutating_call(storage)

    @pytest.mark.asyncio
    async def test_load_then_stop_starts_no_background_task(self, monkeypatch):
        storage = _storage_mock(devices=[_virtual_device_dto()])
        monkeypatch.setattr(
            "devices_manager.service.build_storage", AsyncMock(return_value=storage)
        )
        tasks_before = asyncio.all_tasks()

        svc = DevicesService(storage_url="memory://test")
        await svc.load()
        await svc.stop()

        assert asyncio.all_tasks() == tasks_before


class TestSinglePhaseConstruction:
    def test_set_storage_absent_from_public_surface(self):
        for cls in (
            TransportRegistry,
            DriverRegistry,
            DeviceRegistry,
            DevicesService,
        ):
            assert not hasattr(cls, "set_storage")

    def test_public_read_before_load_raises(self):
        svc = DevicesService()
        with pytest.raises(StorageNotInitializedError):
            svc.list_devices()
        with pytest.raises(StorageNotInitializedError):
            _ = svc.device_ids

    @pytest.mark.asyncio
    async def test_stop_before_load_is_a_noop(self):
        svc = DevicesService()
        await svc.stop()

    @pytest.mark.asyncio
    async def test_load_unsupported_scheme_still_raises(self):
        svc = DevicesService(storage_url="bogus://nowhere")
        with pytest.raises(UnsupportedStorageError):
            await svc.load()
