"""Tests for CoreDevice sync lifecycle."""

from __future__ import annotations

import asyncio
import logging
from unittest.mock import AsyncMock

import pytest

from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.device import (
    CoreDevice,
    DeviceBase,
)
from devices_manager.core.device.connection_status import CONNECTION_STATUS_ATTR
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    UpdateStrategy,
)
from devices_manager.types import ConnectionStatus, DataType, TransportProtocols


@pytest.fixture
def grouped_driver() -> Driver:
    """core (fast) + config (slow) named groups, plus one ungrouped attribute
    that should fall back to the driver-level polling_interval."""
    attrs = [
        AttributeDriver(
            name="temperature",
            data_type=DataType.FLOAT,
            read="GET /temperature",
            write=None,
            codecs=[CodecSpec(name="identity", argument="")],
            polling_group="core",
        ),
        AttributeDriver(
            name="install_date",
            data_type=DataType.STRING,
            read="GET /install_date",
            write=None,
            codecs=[CodecSpec(name="identity", argument="")],
            polling_group="config",
        ),
        AttributeDriver(
            name="humidity",
            data_type=DataType.FLOAT,
            read="GET /humidity",
            write=None,
            codecs=[CodecSpec(name="identity", argument="")],
        ),
    ]
    return Driver(
        metadata=DriverMetadata(id="grouped_driver"),
        env={},
        transport=TransportProtocols.HTTP,
        device_config_required=[],
        update_strategy=UpdateStrategy(
            polling_interval=30, polling_groups={"core": 5, "config": 3600}
        ),
        attributes={a.name: a for a in attrs},
    )


def _observability_records(
    caplog: pytest.LogCaptureFixture,
) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.name == "devices_manager.observability"]


@pytest.fixture
def grouped_device(grouped_driver: Driver, mock_transport_client) -> CoreDevice:
    return CoreDevice.from_base(
        DeviceBase(id="gd", name="Grouped device", config={}),
        driver=grouped_driver,
        transport=mock_transport_client,
    )


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
        assert device._poll_tasks == {}  # noqa: SLF001
        await device.start_sync()
        assert list(device._poll_tasks.values())  # noqa: SLF001
        assert not next(iter(device._poll_tasks.values())).done()  # noqa: SLF001
        await device.stop_sync()

    @pytest.mark.asyncio
    async def test_stop_sync_cancels_poll_task(self, device: CoreDevice):
        await device.start_sync()
        tasks = list(device._poll_tasks.values())  # noqa: SLF001
        await device.stop_sync()
        assert device._poll_tasks == {}  # noqa: SLF001
        assert tasks
        assert all(task.done() for task in tasks)

    @pytest.mark.asyncio
    async def test_start_sync_idempotent(self, device: CoreDevice):
        await device.start_sync()
        first_tasks = dict(device._poll_tasks)  # noqa: SLF001
        await device.start_sync()
        assert device._poll_tasks == first_tasks  # noqa: SLF001
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
        assert device._poll_tasks == {}  # noqa: SLF001
        await device.stop_sync()

    @pytest.mark.asyncio
    async def test_poll_loop_reads_attributes(
        self,
        device: CoreDevice,
        mock_transport_client,
    ):
        mock_transport_client.read = AsyncMock(return_value="25.5")
        await device.start_sync()
        await asyncio.sleep(0.1)
        await device.stop_sync()
        assert mock_transport_client.read.called


class TestCoreDevicePollingGroups:
    def test_polling_groups_buckets_by_group(self, grouped_device: CoreDevice):
        groups = grouped_device._polling_groups()  # noqa: SLF001
        assert groups == {
            "core": (5, ["temperature"]),
            "config": (3600, ["install_date"]),
            None: (30, ["humidity"]),
        }

    def test_polling_groups_excludes_internal_and_unreadable(
        self, grouped_device: CoreDevice
    ):
        # connection_status is added automatically as an INTERNAL attribute
        # and must never be scheduled for polling.
        groups = grouped_device._polling_groups()  # noqa: SLF001
        all_names = {name for _, names in groups.values() for name in names}
        assert "connection_status" not in all_names

    @pytest.mark.asyncio
    async def test_start_sync_spawns_one_task_per_group(
        self, grouped_device: CoreDevice
    ):
        await grouped_device.start_sync()
        assert set(grouped_device._poll_tasks) == {"core", "config", None}  # noqa: SLF001
        await grouped_device.stop_sync()

    @pytest.mark.asyncio
    async def test_stop_sync_cancels_all_group_tasks(self, grouped_device: CoreDevice):
        await grouped_device.start_sync()
        tasks = list(grouped_device._poll_tasks.values())  # noqa: SLF001
        await grouped_device.stop_sync()
        assert all(task.done() for task in tasks)

    @pytest.mark.asyncio
    async def test_read_group_shares_one_sweep_id_per_sweep(
        self, grouped_device: CoreDevice, mock_transport_client
    ):
        sweep_ids: list[str | None] = []
        real_read = mock_transport_client.read

        async def recording_read(address, sweep_id: str | None = None) -> str:
            sweep_ids.append(sweep_id)
            return await real_read(address, sweep_id)

        mock_transport_client.read = recording_read
        mock_transport_client._read = AsyncMock(return_value="20.0")  # noqa: SLF001

        await grouped_device._read_group(["temperature", "humidity"])  # noqa: SLF001

        assert len(sweep_ids) == 2
        assert sweep_ids[0] is not None
        assert sweep_ids[0] == sweep_ids[1]

    @pytest.mark.asyncio
    async def test_read_group_only_reads_its_own_attributes(
        self, grouped_device: CoreDevice, mock_transport_client
    ):
        mock_transport_client._read = AsyncMock(return_value="20.0")  # noqa: SLF001

        await grouped_device._read_group(["temperature"])  # noqa: SLF001

        assert grouped_device.get_attribute_value("temperature") == 20.0
        assert grouped_device.get_attribute_value("install_date") is None
        assert grouped_device.get_attribute_value("humidity") is None

    @pytest.mark.asyncio
    async def test_read_group_applies_results_incrementally_despite_one_failure(
        self, grouped_device: CoreDevice, mock_transport_client
    ):
        """One bad read/decode in the sweep must not block the others."""

        async def flaky_read(address, sweep_id: str | None = None) -> str:  # noqa: ARG001
            if address.id == "GET /temperature":
                raise ConnectionError("boom")
            return "20.0"

        mock_transport_client.read = flaky_read

        await grouped_device._read_group(["temperature", "humidity"])  # noqa: SLF001

        assert grouped_device.get_attribute_value("temperature") is None
        assert grouped_device.get_attribute_value("humidity") == 20.0

    @pytest.mark.asyncio
    async def test_read_group_skips_stale_attribute_name(
        self, grouped_device: CoreDevice, mock_transport_client
    ):
        """A name captured at task-start that got deleted from the driver by a
        concurrent patch (before the device restarts) must not crash the sweep."""
        del grouped_device.driver.attributes["temperature"]
        mock_transport_client._read = AsyncMock(return_value="20.0")  # noqa: SLF001

        await grouped_device._read_group(["temperature", "humidity"])  # noqa: SLF001

        assert grouped_device.get_attribute_value("humidity") == 20.0

    @pytest.mark.asyncio
    async def test_read_group_isolates_address_build_failure(
        self, grouped_device: CoreDevice, mock_transport_client
    ):
        """One attribute whose address can't be built (e.g. a template
        referencing a missing context key) must not stop siblings in the
        same group from being read."""
        bad_driver = grouped_device.driver.attributes["temperature"].model_copy(
            update={"read": "GET /{missing}"}
        )
        grouped_device.driver.attributes["temperature"] = bad_driver
        mock_transport_client._read = AsyncMock(return_value="20.0")  # noqa: SLF001

        await grouped_device._read_group(["temperature", "humidity"])  # noqa: SLF001

        assert grouped_device.get_attribute_value("temperature") is None
        assert grouped_device.get_attribute_value("humidity") == 20.0

    @pytest.mark.asyncio
    async def test_read_group_updates_connection_status_on_success(
        self, grouped_device: CoreDevice, mock_transport_client
    ):
        assert (
            grouped_device.get_attribute_value(CONNECTION_STATUS_ATTR)
            == ConnectionStatus.IDLE
        )
        mock_transport_client._read = AsyncMock(return_value="20.0")  # noqa: SLF001

        await grouped_device._read_group(["temperature"])  # noqa: SLF001

        assert (
            grouped_device.get_attribute_value(CONNECTION_STATUS_ATTR)
            == ConnectionStatus.OK
        )

    @pytest.mark.asyncio
    async def test_read_group_updates_connection_status_on_read_error(
        self, grouped_device: CoreDevice, mock_transport_client
    ):
        async def failing_read(address, sweep_id: str | None = None) -> str:  # noqa: ARG001
            raise ConnectionError("boom")

        mock_transport_client.read = failing_read

        await grouped_device._read_group(["temperature"])  # noqa: SLF001

        assert (
            grouped_device.get_attribute_value(CONNECTION_STATUS_ATTR)
            == ConnectionStatus.ERROR
        )

    @pytest.mark.asyncio
    async def test_apply_read_result_on_update_failure_is_not_mislabeled(
        self, grouped_device: CoreDevice, mock_transport_client, caplog
    ):
        """A raising on_update listener must be logged under its own message,
        not folded into the decode-failure log line, and the read/decode
        itself must still count as a successful outcome."""
        grouped_device.on_update = lambda *args: (_ for _ in ()).throw(  # noqa: ARG005
            RuntimeError("listener boom")
        )
        mock_transport_client._read = AsyncMock(return_value="20.0")  # noqa: SLF001

        with caplog.at_level("WARNING"):
            await grouped_device._read_group(["temperature"])  # noqa: SLF001

        # The value was applied before the listener raised: decode/update
        # succeeded, only the downstream listener misbehaved.
        assert grouped_device.get_attribute_value("temperature") == 20.0
        assert "on_update listener failed" in caplog.text
        assert "failed to decode" not in caplog.text
        assert (
            grouped_device.get_attribute_value(CONNECTION_STATUS_ATTR)
            == ConnectionStatus.OK
        )

    @pytest.mark.asyncio
    async def test_read_group_emits_observability_log_on_success(
        self, grouped_device: CoreDevice, mock_transport_client, caplog
    ):
        """The group-read path must emit the same devices_manager.observability
        log line the single-attribute @log_event decorator emits, not just
        update the attribute's internal event log."""
        mock_transport_client._read = AsyncMock(return_value="20.0")  # noqa: SLF001

        with caplog.at_level(logging.INFO, logger="devices_manager.observability"):
            await grouped_device._read_group(["temperature"])  # noqa: SLF001

        records = _observability_records(caplog)
        assert len(records) == 1
        fields = records[0].__dict__
        assert fields["event"] == "read"
        assert fields["status"] == "ok"
        assert fields["attribute"] == "temperature"
        assert fields["device_id"] == "gd"
        assert fields["driver_id"] == "grouped_driver"
        assert fields["protocol"] == TransportProtocols.HTTP
        assert isinstance(fields["duration_ms"], float)
        assert fields["duration_ms"] >= 0

    @pytest.mark.asyncio
    async def test_read_group_emits_observability_log_on_error(
        self, grouped_device: CoreDevice, mock_transport_client, caplog
    ):
        async def failing_read(address, sweep_id: str | None = None) -> str:  # noqa: ARG001
            raise ConnectionError("boom")

        mock_transport_client.read = failing_read

        with caplog.at_level(logging.INFO, logger="devices_manager.observability"):
            await grouped_device._read_group(["temperature"])  # noqa: SLF001

        records = _observability_records(caplog)
        assert len(records) == 1
        fields = records[0].__dict__
        assert fields["event"] == "read"
        assert fields["status"] == "error"
        assert fields["attribute"] == "temperature"

    @pytest.mark.asyncio
    async def test_read_group_reports_per_result_duration_not_cumulative(
        self, grouped_device: CoreDevice, mock_transport_client, caplog
    ):
        """Regression test: duration_ms must reflect the time since the
        previous result in the sweep, not the whole sweep so far, so a slow
        read ahead of it in the stream doesn't inflate a fast attribute's
        reported duration."""

        async def slow_then_fast_read(
            address,
            sweep_id: str | None = None,  # noqa: ARG001
        ) -> str:
            if address.id == "GET /temperature":
                await asyncio.sleep(0.05)
            return "20.0"

        mock_transport_client.read = slow_then_fast_read

        with caplog.at_level(logging.INFO, logger="devices_manager.observability"):
            await grouped_device._read_group(["temperature", "humidity"])  # noqa: SLF001

        records = {
            r.__dict__["attribute"]: r.__dict__["duration_ms"]
            for r in _observability_records(caplog)
        }
        assert records["temperature"] >= 40
        assert records["humidity"] < 25

    @pytest.mark.asyncio
    async def test_stop_sync_survives_a_poll_task_that_died(
        self, grouped_device: CoreDevice
    ):
        """A group task that ends with an unhandled exception must not make
        stop_sync() raise, since that would abort cleanup for every other
        group (and, via restart_devices, every other device)."""

        async def dying_loop() -> None:
            raise RuntimeError("boom")

        await grouped_device.init_listeners()
        grouped_device._poll_tasks["core"] = asyncio.create_task(dying_loop())  # noqa: SLF001
        await asyncio.sleep(0)  # let the task actually run and finish

        await grouped_device.stop_sync()

        assert grouped_device._poll_tasks == {}  # noqa: SLF001
        assert grouped_device.syncing is False
