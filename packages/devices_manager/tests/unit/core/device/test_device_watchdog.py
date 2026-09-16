from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.device.connection_status import SILENCE_ERROR_MULTIPLIER
from devices_manager.core.device.connection_status_attribute import (
    CONNECTION_STATUS_ATTR,
)
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    HealthCheck,
    UpdateStrategy,
)
from devices_manager.types import ConnectionStatus, DataType, TransportProtocols

from ..fixtures.fake_time import fake_time

WATCHDOG_INTERVAL = 1
TICK = 0.05


@pytest.fixture
def push_only_attributes() -> list[AttributeDriver]:
    return [
        AttributeDriver(
            name="temperature",
            data_type=DataType.FLOAT,
            read={"topic": "/sensors/temperature"},
            write=None,
            codecs=[CodecSpec(name="identity", argument="")],
        )
    ]


@pytest.fixture
def push_driver_with_interval(push_only_attributes: list[AttributeDriver]) -> Driver:
    return Driver(
        metadata=DriverMetadata(id="push_driver_interval"),
        env={},
        device_config_required=[],
        transport=TransportProtocols.MQTT,
        update_strategy=UpdateStrategy(polling_enabled=False),
        healthcheck=HealthCheck(expected_push_interval=WATCHDOG_INTERVAL),
        attributes={a.name: a for a in push_only_attributes},
    )


@pytest.fixture
def push_only_driver_no_interval(
    push_only_attributes: list[AttributeDriver],
) -> Driver:
    return Driver(
        metadata=DriverMetadata(id="push_driver_no_interval"),
        env={},
        device_config_required=[],
        transport=TransportProtocols.MQTT,
        update_strategy=UpdateStrategy(polling_enabled=False),
        attributes={a.name: a for a in push_only_attributes},
    )


def _make_device(
    driver: Driver, transport, initial_values: dict | None = None
) -> CoreDevice:
    return CoreDevice.from_base(
        DeviceBase(id="d_watchdog", name="Watchdog Device", config={}),
        driver=driver,
        transport=transport,
        initial_values=initial_values,
    )


@pytest.fixture
def guarded_push_device(push_driver_with_interval, mock_push_transport_client):
    device = _make_device(push_driver_with_interval, mock_push_transport_client)
    device.rebuild_attribute(
        AttributeDriver.model_validate(
            {
                "name": "setpoint",
                "data_type": "float",
                "read": {"topic": "/sensors/setpoint"},
                "write": {"topic": "/sensors/setpoint"},
                "write_constraints": {"minimum": {"attribute": "temperature"}},
            }
        )
    )
    return device


async def _silence(device: CoreDevice, multiplier: float) -> None:
    """Let ``multiplier`` silence intervals pass (fast-forwarded loop time)."""
    interval = device.expected_interval
    assert interval is not None
    await asyncio.sleep(multiplier * interval)


# expected_interval resolution


class TestExpectedInterval:
    def test_push_with_declared_interval(
        self,
        push_driver_with_interval: Driver,
        mock_push_transport_client,
    ) -> None:
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        assert device.expected_interval == float(WATCHDOG_INTERVAL)

    def test_push_only_no_declared_interval_returns_none(
        self, push_only_driver_no_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_only_driver_no_interval, mock_push_transport_client)
        assert device.expected_interval is None

    def test_pull_device_returns_none(self, device: CoreDevice) -> None:
        assert device.expected_interval is None


# Silence detection (observable connection_status)


@fake_time
@pytest.mark.asyncio
class TestWatchdogSilenceDetection:
    async def test_degrades_after_silence(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        await device.start_sync()
        await _silence(device, 2.5)
        assert (
            device.get_attribute_value(CONNECTION_STATUS_ATTR)
            == ConnectionStatus.DEGRADED
        )
        await device.stop_sync()

    async def test_errors_after_extended_silence(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        await device.start_sync()
        await _silence(device, SILENCE_ERROR_MULTIPLIER + 0.5)
        assert (
            device.get_attribute_value(CONNECTION_STATUS_ATTR) == ConnectionStatus.ERROR
        )
        await device.stop_sync()

    async def test_read_outcomes_do_not_override_silence(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        """A silent push device stays in error: a later failed read used to
        pull it back to degraded."""
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        await device.start_sync()
        await mock_push_transport_client.simulate_event("/sensors/temperature", 21.0)
        await _silence(device, SILENCE_ERROR_MULTIPLIER + 0.5)
        mock_push_transport_client.read = AsyncMock(side_effect=OSError("timeout"))
        with pytest.raises(OSError, match="timeout"):
            await device.read_attribute_value("temperature")
        assert (
            device.get_attribute_value(CONNECTION_STATUS_ATTR) == ConnectionStatus.ERROR
        )
        await device.stop_sync()

    async def test_data_coming_back_clears_silence(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        await device.start_sync()
        await _silence(device, SILENCE_ERROR_MULTIPLIER + 0.5)
        await mock_push_transport_client.simulate_event("/sensors/temperature", 21.0)
        await asyncio.sleep(0)
        assert device.get_attribute_value(CONNECTION_STATUS_ATTR) == ConnectionStatus.OK
        await device.stop_sync()

    async def test_no_escalation_when_fresh(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        await device.start_sync()
        await asyncio.sleep(TICK)
        assert device.get_attribute_value(CONNECTION_STATUS_ATTR) not in (
            ConnectionStatus.DEGRADED,
            ConnectionStatus.ERROR,
        )
        await device.stop_sync()

    async def test_no_watchdog_without_interval(
        self, push_only_driver_no_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_only_driver_no_interval, mock_push_transport_client)
        await device.start_sync()
        await asyncio.sleep(TICK)
        assert (
            device.get_attribute_value(CONNECTION_STATUS_ATTR) == ConnectionStatus.IDLE
        )
        await device.stop_sync()


@fake_time
@pytest.mark.asyncio
class TestTrustExpiryAndConnectionHealth:
    async def test_commands_expire_before_health_degrades(
        self, guarded_push_device, mock_push_transport_client
    ):
        device = guarded_push_device
        await device.start_sync()
        await mock_push_transport_client.simulate_event("/sensors/temperature", 21.0)
        assert device.evaluate_attribute_write("setpoint", 22).eligible
        await _silence(device, 1.1)
        assert device.get_attribute("setpoint").write_state.status == "unknown"
        assert not device.evaluate_attribute_write("setpoint", 22).eligible
        assert device.get_attribute_value("temperature") == 21.0
        assert device.connection_monitor.status == ConnectionStatus.OK
        await _silence(device, 1)
        assert device.connection_monitor.status == ConnectionStatus.DEGRADED
        await _silence(device, 1)
        assert device.connection_monitor.status == ConnectionStatus.ERROR
        await mock_push_transport_client.simulate_event("/sensors/temperature", 21.0)
        assert device.evaluate_attribute_write("setpoint", 22).eligible
        assert device.connection_monitor.status == ConnectionStatus.OK
        await device.stop_sync()

    async def test_manual_read_renews_commands_without_clearing_push_silence(
        self, guarded_push_device, mock_push_transport_client
    ):
        device = guarded_push_device
        await device.start_sync()
        await mock_push_transport_client.simulate_event("/sensors/temperature", 21.0)
        await _silence(device, 3.1)
        mock_push_transport_client.read = AsyncMock(return_value=21.0)
        await device.read_attribute_value("temperature")
        assert device.evaluate_attribute_write("setpoint", 22).eligible
        assert device.connection_monitor.status == ConnectionStatus.ERROR
        await _silence(device, 1.1)
        assert not device.evaluate_attribute_write("setpoint", 22).eligible
        assert device.connection_monitor.status == ConnectionStatus.ERROR
        await device.stop_sync()

    @pytest.mark.parametrize("stop_first", [False, True])
    async def test_restart_cancels_the_old_expiry_timer(
        self, guarded_push_device, mock_push_transport_client, stop_first
    ):
        device = guarded_push_device
        await device.start_sync()
        await mock_push_transport_client.simulate_event("/sensors/temperature", 21.0)
        await _silence(device, 0.75)
        if stop_first:
            await device.stop_sync()
            assert not device.evaluate_attribute_write("setpoint", 22).eligible
        await device.start_sync()
        await mock_push_transport_client.simulate_event("/sensors/temperature", 21.0)
        await _silence(device, 0.5)
        assert device.evaluate_attribute_write("setpoint", 22).eligible
        await _silence(device, 0.6)
        assert not device.evaluate_attribute_write("setpoint", 22).eligible
        await device.stop_sync()
