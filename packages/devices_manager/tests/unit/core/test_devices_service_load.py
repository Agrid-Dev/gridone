"""Service-boundary tests for the single-phase, read-only DevicesService load.

Covers the AGR-834 acceptance criteria: hydrating from a populated backend
performs zero writes, storage and registries are built once in ``load()``
(no ``set_storage`` swap), ``load()`` starts no background work, a bad stored
entry is skipped and surfaced via ``load_errors`` instead of aborting the
boot, and backend-level failures still raise.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio

from devices_manager import DevicesService
from devices_manager.core.device import Attribute
from devices_manager.core.device_registry import DeviceRegistry
from devices_manager.core.driver import UpdateStrategy
from devices_manager.core.driver_registry import DriverRegistry
from devices_manager.core.transport_registry import TransportRegistry
from devices_manager.dto import (
    Device,
    PhysicalDeviceCreate,
    TransportCreate,
    driver_to_public,
)
from devices_manager.types import DataType, DeviceKind, TransportProtocols
from models.errors import (
    StorageConnectionError,
    StorageNotInitializedError,
    UnsupportedStorageError,
)

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


def _seed_backend(backend: AsyncMock, entities: list) -> None:
    by_id = {entity.id: entity for entity in entities}
    backend.list_all.return_value = list(by_id)
    backend.read.side_effect = lambda item_id: by_id[item_id]


def _storage_mock(
    *,
    devices: list[Device] | None = None,
    drivers: list[DriverSpec] | None = None,
) -> AsyncMock:
    """An ``AsyncMock`` standing in for ``DevicesManagerStorage``."""
    storage = AsyncMock()
    _seed_backend(storage.devices, devices or [])
    _seed_backend(storage.drivers, drivers or [])
    _seed_backend(storage.transports, [])
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
    """A ``yaml:`` DB dir seeded with one transport, one driver and one device.

    Polling is disabled on the seeded driver so tests can ``start()`` the
    service without triggering network requests.
    """
    driver.update_strategy = UpdateStrategy(polling_enabled=False)
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


class TestFaultTolerantLoad:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("subdir", "kind"),
        [
            ("devices", "device"),
            ("drivers", "driver"),
            ("transports", "transport"),
        ],
    )
    async def test_corrupt_file_is_skipped_and_recorded(
        self,
        tmp_path: Path,
        seeded_yaml_db: tuple[str, dict[str, str]],
        subdir: str,
        kind: str,
    ):
        url, ids = seeded_yaml_db
        (tmp_path / subdir / "corrupt.yaml").write_text("[ unclosed", encoding="utf-8")

        svc = DevicesService(url)
        await svc.start()
        try:
            assert ids["device_id"] in svc.device_ids
            assert ids["driver_id"] in svc.driver_ids
            assert ids["transport_id"] in svc.transport_ids
            [error] = svc.load_errors
            assert (error.kind, error.entity_id) == (kind, "corrupt")
        finally:
            await svc.stop()

    @pytest.mark.asyncio
    async def test_device_with_missing_driver_is_skipped(
        self, tmp_path: Path, seeded_yaml_db: tuple[str, dict[str, str]]
    ):
        url, ids = seeded_yaml_db
        (tmp_path / "drivers" / f"{ids['driver_id']}.yaml").unlink()

        svc = DevicesService(url)
        await svc.load()
        try:
            assert svc.device_ids == set()
            assert ids["transport_id"] in svc.transport_ids
            [error] = svc.load_errors
            assert (error.kind, error.entity_id) == ("device", ids["device_id"])
        finally:
            await svc.stop()

    @pytest.mark.asyncio
    async def test_skipped_entity_is_logged_at_error_with_its_id(
        self,
        tmp_path: Path,
        seeded_yaml_db: tuple[str, dict[str, str]],
        caplog: pytest.LogCaptureFixture,
    ):
        url, _ = seeded_yaml_db
        (tmp_path / "devices" / "corrupt.yaml").write_text(
            "[ unclosed", encoding="utf-8"
        )

        svc = DevicesService(url)
        with caplog.at_level(logging.ERROR, logger="devices_manager.service"):
            await svc.load()
        await svc.stop()

        assert "corrupt" in caplog.text

    @pytest.mark.asyncio
    async def test_clean_boot_has_no_load_errors(
        self, seeded_yaml_db: tuple[str, dict[str, str]]
    ):
        url, _ = seeded_yaml_db
        svc = DevicesService(url)
        await svc.load()
        try:
            assert svc.load_errors == []
        finally:
            await svc.stop()

    @pytest.mark.asyncio
    async def test_uninitializable_backend_still_raises(self, tmp_path: Path):
        blocker = tmp_path / "blocker"
        blocker.write_text("not a directory")

        svc = DevicesService(f"yaml:{blocker}/db")
        with pytest.raises(StorageConnectionError):
            await svc.load()


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
