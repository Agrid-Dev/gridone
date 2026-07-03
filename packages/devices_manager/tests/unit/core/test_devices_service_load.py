"""Service-boundary tests for the single-phase, read-only DevicesService load.

Covers the AGR-834 read-only-load acceptance criteria: hydrating from a
populated backend performs zero writes, storage and registries are built once
in ``load()`` (no ``set_storage`` swap), and ``load()`` starts no background
work.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import pytest
import pytest_asyncio
from pydantic import BaseModel

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
from devices_manager.storage.memory import MemoryDevicesStorage
from devices_manager.types import (
    DataType,
    DeviceKind,
    TransportProtocols,
)
from models.errors import StorageNotInitializedError, UnsupportedStorageError

if TYPE_CHECKING:
    from pathlib import Path

    from devices_manager.storage import DeviceStorageBackend, StorageBackend


def _snapshot_files(root: Path) -> dict[Path, tuple[bytes, int]]:
    """Map every yaml file to its bytes and mtime, to detect any write."""
    return {
        path: (path.read_bytes(), path.stat().st_mtime_ns)
        for path in sorted(root.rglob("*.yaml"))
    }


class _RecordingBackend[M: BaseModel]:
    """Storage-protocol double that forwards reads and records mutations."""

    def __init__(self, inner: StorageBackend[M], calls: list[tuple[str, str]]) -> None:
        self._inner = inner
        self._calls = calls

    async def read(self, item_id: str) -> M:
        return await self._inner.read(item_id)

    async def read_all(self) -> list[M]:
        return await self._inner.read_all()

    async def list_all(self) -> list[str]:
        return await self._inner.list_all()

    async def write(self, item_id: str, data: M) -> None:
        self._calls.append(("write", item_id))
        await self._inner.write(item_id, data)

    async def delete(self, item_id: str) -> None:
        self._calls.append(("delete", item_id))
        await self._inner.delete(item_id)


class _RecordingDeviceBackend(_RecordingBackend[Device]):
    def __init__(
        self, inner: DeviceStorageBackend, calls: list[tuple[str, str]]
    ) -> None:
        super().__init__(inner, calls)
        self._device_inner = inner

    async def set_tag(self, device_id: str, key: str, value: str) -> None:
        self._calls.append(("set_tag", device_id))
        await self._device_inner.set_tag(device_id, key, value)

    async def delete_tag(self, device_id: str, key: str) -> None:
        self._calls.append(("delete_tag", device_id))
        await self._device_inner.delete_tag(device_id, key)


class RecordingStorage:
    """``DevicesManagerStorage`` double recording every mutating call."""

    def __init__(self, inner: MemoryDevicesStorage) -> None:
        self.calls: list[tuple[str, str]] = []
        self._inner = inner
        self.devices = _RecordingDeviceBackend(inner.devices, self.calls)
        self.drivers = _RecordingBackend(inner.drivers, self.calls)
        self.transports = _RecordingBackend(inner.transports, self.calls)

    async def save_attribute(self, device_id: str, attribute: Attribute) -> None:
        self.calls.append(("save_attribute", device_id))
        await self._inner.save_attribute(device_id, attribute)

    async def close(self) -> None:
        await self._inner.close()


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
    async def test_load_records_no_mutating_call_on_storage_double(
        self, monkeypatch, driver
    ):
        inner = MemoryDevicesStorage()
        await inner.drivers.write(driver.id, driver_to_public(driver))
        await inner.devices.write("vd1", _virtual_device_dto())
        storage = RecordingStorage(inner)

        async def _build(_url: str | None) -> RecordingStorage:
            return storage

        monkeypatch.setattr("devices_manager.service.build_storage", _build)

        svc = DevicesService(storage_url="memory://test")
        await svc.load()
        try:
            assert svc.device_ids == {"vd1"}
            assert svc.driver_ids == {driver.id}
        finally:
            await svc.stop()

        assert storage.calls == []

    @pytest.mark.asyncio
    async def test_load_registers_no_persistence_listener(self, monkeypatch):
        """An attribute update after ``load()`` must not be persisted."""
        inner = MemoryDevicesStorage()
        await inner.devices.write("vd1", _virtual_device_dto())
        storage = RecordingStorage(inner)

        async def _build(_url: str | None) -> RecordingStorage:
            return storage

        monkeypatch.setattr("devices_manager.service.build_storage", _build)

        svc = DevicesService(storage_url="memory://test")
        await svc.load()
        try:
            await svc.write_device_attribute("vd1", "value", 42.0)
            await asyncio.sleep(0.05)
        finally:
            await svc.stop()

        assert ("save_attribute", "vd1") not in storage.calls

    @pytest.mark.asyncio
    async def test_load_then_stop_starts_no_background_task(
        self, seeded_yaml_db: tuple[str, dict[str, str]]
    ):
        url, _ = seeded_yaml_db
        tasks_before = asyncio.all_tasks()

        svc = DevicesService(url)
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
