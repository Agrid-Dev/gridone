"""Tests for the silence-detection watchdog on PhysicalDevice."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest

from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.device import DeviceBase, PhysicalDevice
from devices_manager.core.device.connection_status import (
    CONNECTION_STATUS_ATTR,
    SILENCE_DEGRADED_MULTIPLIER,
    SILENCE_ERROR_MULTIPLIER,
    seed_watchdog_last_event_time,
)
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
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
        update_strategy=UpdateStrategy(
            polling_enabled=False,
            expected_push_interval=WATCHDOG_INTERVAL,
        ),
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
) -> PhysicalDevice:
    return PhysicalDevice.from_base(
        DeviceBase(id="d_watchdog", name="Watchdog Device", config={}),
        driver=driver,
        transport=transport,
        initial_values=initial_values,
    )


def _silence(device: PhysicalDevice, multiplier: float) -> None:
    interval = device.expected_interval
    assert interval is not None
    device._last_event_time = datetime.now(UTC) - timedelta(  # noqa: SLF001
        seconds=multiplier * interval
    )


# expected_interval resolution


class TestExpectedInterval:
    def test_push_with_declared_interval(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        assert device.expected_interval == float(WATCHDOG_INTERVAL)

    def test_push_only_no_declared_interval_returns_none(
        self, push_only_driver_no_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_only_driver_no_interval, mock_push_transport_client)
        assert device.expected_interval is None

    def test_pull_device_uses_poll_interval(self, device: PhysicalDevice) -> None:
        assert device.expected_interval == device.poll_interval


# Watchdog lifecycle


@pytest.mark.asyncio
class TestWatchdogLifecycle:
    async def test_watchdog_started_when_interval_set(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        await device.start_sync()
        assert device._watchdog_task is not None  # noqa: SLF001
        assert not device._watchdog_task.done()  # noqa: SLF001
        await device.stop_sync()

    async def test_watchdog_not_started_when_no_interval(
        self, push_only_driver_no_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_only_driver_no_interval, mock_push_transport_client)
        await device.start_sync()
        assert device._watchdog_task is None  # noqa: SLF001
        await device.stop_sync()

    async def test_watchdog_stopped_on_stop_sync(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        await device.start_sync()
        task = device._watchdog_task  # noqa: SLF001
        assert task is not None
        await device.stop_sync()
        assert task.done()
        assert device._watchdog_task is None  # noqa: SLF001


# Silence detection


@pytest.mark.asyncio
class TestWatchdogSilenceDetection:
    async def test_writes_degraded_after_one_interval(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        _silence(device, 1.5)
        await device.start_sync()
        await asyncio.sleep(TICK)
        assert (
            device.get_attribute_value(CONNECTION_STATUS_ATTR)
            == ConnectionStatus.DEGRADED
        )
        await device.stop_sync()

    async def test_writes_error_after_k_intervals(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        _silence(device, SILENCE_ERROR_MULTIPLIER + 0.5)
        await device.start_sync()
        await asyncio.sleep(TICK)
        assert (
            device.get_attribute_value(CONNECTION_STATUS_ATTR) == ConnectionStatus.ERROR
        )
        await device.stop_sync()

    async def test_no_silence_status_when_fresh(
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

    async def test_new_device_seeds_clock_on_start(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        assert device._last_event_time is None  # noqa: SLF001
        await device.start_sync()
        await asyncio.sleep(TICK)
        assert device._last_event_time is not None  # noqa: SLF001
        await device.stop_sync()

    async def test_watchdog_failure_does_not_disrupt_device(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(push_driver_with_interval, mock_push_transport_client)
        _silence(device, 1.5)
        with patch.object(
            device, "_set_watchdog_status", side_effect=RuntimeError("boom")
        ):
            await device.start_sync()
            await asyncio.sleep(TICK)
        await device.stop_sync()


# seed_watchdog_last_event_time


class TestSeedWatchdogLastEventTime:
    def test_idle_seeds_none(self) -> None:
        assert seed_watchdog_last_event_time(ConnectionStatus.IDLE, 60.0) is None

    def test_none_status_seeds_none(self) -> None:
        assert seed_watchdog_last_event_time(None, 60.0) is None

    def test_none_interval_seeds_none(self) -> None:
        assert seed_watchdog_last_event_time(ConnectionStatus.OK, None) is None

    def test_ok_seeds_now(self) -> None:
        before = datetime.now(UTC)
        result = seed_watchdog_last_event_time(ConnectionStatus.OK, 60.0)
        after = datetime.now(UTC)
        assert result is not None
        assert before <= result <= after

    def test_degraded_seeds_one_interval_ago(self) -> None:
        interval = 60.0
        before = datetime.now(UTC)
        result = seed_watchdog_last_event_time(ConnectionStatus.DEGRADED, interval)
        after = datetime.now(UTC)
        assert result is not None
        expected = timedelta(seconds=SILENCE_DEGRADED_MULTIPLIER * interval)
        assert before - expected <= result <= after - expected

    def test_error_seeds_k_intervals_ago(self) -> None:
        interval = 60.0
        before = datetime.now(UTC)
        result = seed_watchdog_last_event_time(ConnectionStatus.ERROR, interval)
        after = datetime.now(UTC)
        assert result is not None
        expected = timedelta(seconds=SILENCE_ERROR_MULTIPLIER * interval)
        assert before - expected <= result <= after - expected


# Restart behavior


@pytest.mark.asyncio
class TestRestartBehavior:
    async def test_error_status_fires_immediately_after_restart(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(
            push_driver_with_interval,
            mock_push_transport_client,
            initial_values={CONNECTION_STATUS_ATTR: ConnectionStatus.ERROR},
        )
        await device.start_sync()
        await asyncio.sleep(TICK)
        assert (
            device.get_attribute_value(CONNECTION_STATUS_ATTR) == ConnectionStatus.ERROR
        )
        await device.stop_sync()

    async def test_ok_status_gives_grace_period_after_restart(
        self, push_driver_with_interval: Driver, mock_push_transport_client
    ) -> None:
        device = _make_device(
            push_driver_with_interval,
            mock_push_transport_client,
            initial_values={CONNECTION_STATUS_ATTR: ConnectionStatus.OK},
        )
        await device.start_sync()
        await asyncio.sleep(TICK)
        assert device.get_attribute_value(CONNECTION_STATUS_ATTR) == ConnectionStatus.OK
        await device.stop_sync()
