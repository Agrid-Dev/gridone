"""Tests for CoreDevice sync lifecycle."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest

from devices_manager.core.device import (
    CoreDevice,
    DeviceBase,
)
from devices_manager.core.driver import UpdateStrategy

if TYPE_CHECKING:
    from devices_manager.core.driver import Driver


class TestCoreDeviceSync:
    @pytest.mark.asyncio
    async def test_start_sync_sets_syncing(self, device: CoreDevice):
        await device.start_sync()
        assert device.syncing is True
        await device.stop_sync()

    @pytest.mark.asyncio
    async def test_stop_sync_clears_syncing(self, device: CoreDevice):
        await device.start_sync()
        await device.stop_sync()
        assert device.syncing is False

    @pytest.mark.asyncio
    async def test_start_sync_spawns_poll_task(self, device: CoreDevice):
        assert device._poll_task is None  # noqa: SLF001
        await device.start_sync()
        assert device._poll_task is not None  # noqa: SLF001
        assert not device._poll_task.done()  # noqa: SLF001
        await device.stop_sync()

    @pytest.mark.asyncio
    async def test_stop_sync_cancels_poll_task(self, device: CoreDevice):
        await device.start_sync()
        task = device._poll_task  # noqa: SLF001
        await device.stop_sync()
        assert device._poll_task is None  # noqa: SLF001
        assert task is not None
        assert task.done()

    @pytest.mark.asyncio
    async def test_start_sync_idempotent(self, device: CoreDevice):
        await device.start_sync()
        first_task = device._poll_task  # noqa: SLF001
        await device.start_sync()
        assert device._poll_task is first_task  # noqa: SLF001
        await device.stop_sync()

    @pytest.mark.asyncio
    async def test_stop_sync_idempotent(self, device: CoreDevice):
        await device.stop_sync()
        assert device.syncing is False

    @pytest.mark.asyncio
    async def test_start_sync_polling_disabled(
        self,
        driver: Driver,
        mock_transport_client,
    ):
        driver.update_strategy = UpdateStrategy(polling_enabled=False)
        device = CoreDevice.from_base(
            DeviceBase(id="d1", name="D", config={"some_id": "x"}),
            driver=driver,
            transport=mock_transport_client,
        )
        await device.start_sync()
        assert device.syncing is True
        assert device._poll_task is None  # noqa: SLF001
        await device.stop_sync()

    @pytest.mark.asyncio
    async def test_poll_loop_calls_update_attributes(
        self,
        device: CoreDevice,
        mock_transport_client,
    ):
        mock_transport_client.read = AsyncMock(return_value="25.5")
        await device.start_sync()
        await asyncio.sleep(0.1)
        await device.stop_sync()
        assert mock_transport_client.read.called
