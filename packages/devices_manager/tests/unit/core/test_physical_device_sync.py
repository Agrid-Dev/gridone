"""Tests for PhysicalDevice and VirtualDevice sync lifecycle."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest

from devices_manager.core.device import (
    Attribute,
    DeviceBase,
    PhysicalDevice,
    VirtualDevice,
)
from devices_manager.core.driver import UpdateStrategy
from devices_manager.types import DataType

if TYPE_CHECKING:
    from devices_manager.core.driver import Driver


class TestPhysicalDeviceSync:
    @pytest.mark.asyncio
    async def test_start_sync_sets_syncing(self, device: PhysicalDevice):
        await device.start_sync()
        assert device.syncing is True
        await device.stop_sync()

    @pytest.mark.asyncio
    async def test_stop_sync_clears_syncing(self, device: PhysicalDevice):
        await device.start_sync()
        await device.stop_sync()
        assert device.syncing is False

    @pytest.mark.asyncio
    async def test_start_sync_spawns_poll_task(self, device: PhysicalDevice):
        assert device._poll_task is None
        await device.start_sync()
        assert device._poll_task is not None
        assert not device._poll_task.done()
        await device.stop_sync()

    @pytest.mark.asyncio
    async def test_stop_sync_cancels_poll_task(self, device: PhysicalDevice):
        await device.start_sync()
        task = device._poll_task
        await device.stop_sync()
        assert device._poll_task is None
        assert task is not None
        assert task.done()

    @pytest.mark.asyncio
    async def test_start_sync_idempotent(self, device: PhysicalDevice):
        await device.start_sync()
        first_task = device._poll_task
        await device.start_sync()
        assert device._poll_task is first_task
        await device.stop_sync()

    @pytest.mark.asyncio
    async def test_stop_sync_idempotent(self, device: PhysicalDevice):
        await device.stop_sync()
        assert device.syncing is False

    @pytest.mark.asyncio
    async def test_start_sync_polling_disabled(
        self,
        driver: Driver,
        mock_transport_client,
    ):
        driver.update_strategy = UpdateStrategy(polling_enabled=False)
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="D", config={"some_id": "x"}),
            driver=driver,
            transport=mock_transport_client,
        )
        await device.start_sync()
        assert device.syncing is True
        assert device._poll_task is None
        await device.stop_sync()

    @pytest.mark.asyncio
    async def test_poll_loop_calls_update_attributes(
        self,
        device: PhysicalDevice,
        mock_transport_client,
    ):
        mock_transport_client.read = AsyncMock(return_value="25.5")
        await device.start_sync()
        await asyncio.sleep(0.1)
        await device.stop_sync()
        assert mock_transport_client.read.called


class TestVirtualDeviceSync:
    @pytest.mark.asyncio
    async def test_start_sync_noop(self):
        vd = VirtualDevice(
            id="vd1",
            name="V",
            attributes={
                "x": Attribute.create("x", DataType.FLOAT, {"read"}),
            },
        )
        await vd.start_sync()
        assert vd.syncing is False

    @pytest.mark.asyncio
    async def test_stop_sync_noop(self):
        vd = VirtualDevice(
            id="vd1",
            name="V",
            attributes={
                "x": Attribute.create("x", DataType.FLOAT, {"read"}),
            },
        )
        await vd.stop_sync()
        assert vd.syncing is False
