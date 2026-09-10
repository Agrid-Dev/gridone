"""Tests for connection_status attribute on CoreDevice."""

from __future__ import annotations

import asyncio
import json
import time
from unittest.mock import AsyncMock, patch

import pytest

from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.device.connection_status import CONNECTION_STATUS_ATTR
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    UpdateStrategy,
)
from devices_manager.types import ConnectionStatus, DataType, TransportProtocols
from models.errors import InvalidError


class TestConnectionStatusCreation:
    def test_attribute_present_on_creation(self, device: CoreDevice) -> None:
        assert CONNECTION_STATUS_ATTR in device.attributes

    def test_initial_value_is_idle(self, device: CoreDevice) -> None:
        cs = device.attributes[CONNECTION_STATUS_ATTR]
        assert cs.current_value == ConnectionStatus.IDLE

    def test_is_internal_kind(self, device: CoreDevice) -> None:
        assert device.attributes[CONNECTION_STATUS_ATTR].kind == AttributeKind.INTERNAL

    def test_is_readonly(self, device: CoreDevice) -> None:
        assert device.attributes[CONNECTION_STATUS_ATTR].read_write_modes == {"read"}

    def test_no_timestamps_on_first_creation(self, device: CoreDevice) -> None:
        attr = device.attributes[CONNECTION_STATUS_ATTR]
        assert attr.last_updated is None
        assert attr.last_changed is None

    def test_restores_stored_value_on_restart(
        self, driver, mock_transport_client
    ) -> None:
        device = CoreDevice.from_base(
            DeviceBase(id="d1", name="D", config={}),
            driver=driver,
            transport=mock_transport_client,
            initial_values={CONNECTION_STATUS_ATTR: ConnectionStatus.OK},
        )
        cs = device.attributes[CONNECTION_STATUS_ATTR]
        assert cs.current_value == ConnectionStatus.OK

    def test_restart_value_has_timestamps(self, driver, mock_transport_client) -> None:
        device = CoreDevice.from_base(
            DeviceBase(id="d1", name="D", config={}),
            driver=driver,
            transport=mock_transport_client,
            initial_values={CONNECTION_STATUS_ATTR: ConnectionStatus.OK},
        )
        attr = device.attributes[CONNECTION_STATUS_ATTR]
        assert attr.last_updated is not None
        assert attr.last_changed is not None


@pytest.mark.asyncio
class TestConnectionStatusRecompute:
    async def test_transitions_to_ok_on_successful_read(
        self, device: CoreDevice, mock_transport_client
    ) -> None:
        mock_transport_client.read = AsyncMock(return_value="25.5")
        await device.read_attribute_value("temperature")
        cs = device.attributes[CONNECTION_STATUS_ATTR]
        assert cs.current_value == ConnectionStatus.OK

    async def test_transitions_to_error_on_all_failed_reads(
        self, device: CoreDevice, mock_transport_client
    ) -> None:
        mock_transport_client.read = AsyncMock(side_effect=OSError("timeout"))
        with pytest.raises(OSError, match="timeout"):
            await device.read_attribute_value("temperature")
        cs = device.attributes[CONNECTION_STATUS_ATTR]
        assert cs.current_value == ConnectionStatus.ERROR

    async def test_read_of_absent_field_still_errors(
        self, device: CoreDevice, mock_transport_client
    ) -> None:
        """Push best-effort does not touch the read path: an absent field errors."""
        mock_transport_client.read = AsyncMock(return_value={"data": {}})
        with pytest.raises(KeyError):
            await device.read_attribute_value("temperature_w_adapter")
        cs = device.attributes[CONNECTION_STATUS_ATTR]
        assert cs.current_value == ConnectionStatus.ERROR

    async def test_transitions_to_degraded_on_mixed_results(
        self, device: CoreDevice, mock_transport_client
    ) -> None:
        mock_transport_client.read = AsyncMock(return_value="25.5")
        await device.read_attribute_value("temperature")
        mock_transport_client.read = AsyncMock(side_effect=OSError("timeout"))
        with pytest.raises(OSError, match="timeout"):
            await device.read_attribute_value("temperature")
        cs = device.attributes[CONNECTION_STATUS_ATTR]
        assert cs.current_value == ConnectionStatus.DEGRADED

    async def test_no_duplicate_on_update_for_same_status(
        self, device: CoreDevice, mock_transport_client
    ) -> None:
        calls: list[str] = []
        device.on_update = lambda _d, name, _prev, _attr: calls.append(name)

        mock_transport_client.read = AsyncMock(return_value="25.5")
        await device.read_attribute_value("temperature")  # idle→ok: fires
        await device.read_attribute_value("temperature")  # ok stays ok: no fire

        assert calls.count(CONNECTION_STATUS_ATTR) == 1

    async def test_transitions_recorded_by_on_update(
        self, device: CoreDevice, mock_transport_client
    ) -> None:
        transitions: list[str] = []

        def _capture(_d, name, _prev, attr) -> None:
            if name == CONNECTION_STATUS_ATTR:
                transitions.append(attr.current_value)

        device.on_update = _capture

        mock_transport_client.read = AsyncMock(return_value="25.5")
        await device.read_attribute_value("temperature")  # idle→ok
        mock_transport_client.read = AsyncMock(side_effect=OSError("e"))
        with pytest.raises(OSError, match="e"):
            await device.read_attribute_value("temperature")  # ok→degraded
        for _ in range(9):
            with pytest.raises(OSError, match="e"):
                await device.read_attribute_value("temperature")  # degraded→error

        assert transitions == [
            ConnectionStatus.OK,
            ConnectionStatus.DEGRADED,
            ConnectionStatus.ERROR,
        ]


@pytest.mark.asyncio
class TestConnectionStatusFailSafe:
    async def test_compute_failure_does_not_disrupt_reads(
        self, device: CoreDevice, mock_transport_client
    ) -> None:
        mock_transport_client.read = AsyncMock(return_value="25.5")
        with patch.object(
            device,
            "_recompute_connection_status",
            side_effect=RuntimeError("boom"),
        ):
            value = await device.read_attribute_value("temperature")
        assert value == 25.5

    async def test_update_attributes_skips_connection_status(
        self, device: CoreDevice, mock_transport_client
    ) -> None:
        mock_transport_client.read = AsyncMock(return_value="22.0")
        await device.update_attributes()
        driver_readable = sum(
            1
            for a in device.attributes.values()
            if a.kind != AttributeKind.INTERNAL and "read" in a.read_write_modes
        )
        assert mock_transport_client.read.call_count == driver_readable

    async def test_read_internal_attribute_raises(self, device: CoreDevice) -> None:
        with pytest.raises(InvalidError, match="internal"):
            await device.read_attribute_value(CONNECTION_STATUS_ATTR)


class TestManyListenersOnOneTopic:
    """A push device with hundreds of attributes on one shared topic runs every
    listener for every frame; keeping the status current must stay cheap."""

    ATTRIBUTE_COUNT = 300
    FRAME_COUNT = 30

    @staticmethod
    def _driver(count: int) -> Driver:
        attributes = [
            AttributeDriver(
                name=f"point_{i}",
                data_type=DataType.FLOAT,
                read={"topic": "updData/${mac}"},
                write=None,
                codecs=[
                    CodecSpec(
                        name="json_path",
                        argument=f'$.data[?(@.name == "point_{i}")].value',
                    )
                ],
            )
            for i in range(count)
        ]
        return Driver(
            metadata=DriverMetadata(id="wide_push_driver"),
            env={},
            device_config_required=[],
            transport=TransportProtocols.MQTT,
            update_strategy=UpdateStrategy(polling_enabled=False),
            attributes={a.name: a for a in attributes},
        )

    @pytest.mark.asyncio
    async def test_status_stays_current_without_rescanning_every_log(
        self, mock_push_transport_client
    ) -> None:
        device = CoreDevice.from_base(
            DeviceBase(id="wide", name="wide", config={"mac": "AA"}),
            driver=self._driver(self.ATTRIBUTE_COUNT),
            transport=mock_push_transport_client,
        )
        await device.init_listeners()
        frames = [
            json.dumps(
                {
                    "data": [
                        {"name": f"point_{i}", "value": 1.0} for i in range(k, k + 3)
                    ]
                }
            )
            for k in range(0, self.FRAME_COUNT * 3, 3)
        ]

        started = time.perf_counter()
        for frame in frames:
            await mock_push_transport_client.simulate_event("updData/AA", frame)
        elapsed = time.perf_counter() - started
        await asyncio.sleep(0)  # listener-driven recomputes run once the turn is over

        assert device.attributes[CONNECTION_STATUS_ATTR].current_value == "ok"
        assert device.attributes["point_5"].current_value == 1.0
        # ~5 s before the fix on a laptop (a rescan per listener), under 1 s after.
        assert elapsed < 3.0, f"{elapsed:.1f}s for {self.FRAME_COUNT} frames"
