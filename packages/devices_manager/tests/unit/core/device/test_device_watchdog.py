from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.device.connection_status import (
    CONNECTION_STATUS_ATTR,
    SILENCE_ERROR_MULTIPLIER,
)
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    HealthCheck,
    UpdateStrategy,
)
from devices_manager.types import ConnectionStatus, DataType, TransportProtocols

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


def _silence(device: CoreDevice, multiplier: float) -> None:
    interval = device.expected_interval
    assert interval is not None
    assert device._watchdog is not None  # noqa: SLF001
    device._watchdog._last_data_time = datetime.now(UTC) - timedelta(  # noqa: SLF001
        seconds=multiplier * interval
    )


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


@pytest.mark.asyncio
class TestWatchdogSilenceDetection:
    async def test_degrades_after_silence(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        await device.start_sync()
        _silence(device, 2.5)
        await asyncio.sleep(TICK)
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
        _silence(device, SILENCE_ERROR_MULTIPLIER + 0.5)
        await asyncio.sleep(TICK)
        assert (
            device.get_attribute_value(CONNECTION_STATUS_ATTR) == ConnectionStatus.ERROR
        )
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
