import asyncio
import logging

import pytest
from opentelemetry.sdk.metrics.export import InMemoryMetricReader

from devices_manager.core.transports.io_timing import IO_LOGGER_NAME, timed_io
from devices_manager.types import TransportProtocols

from ...conftest import histogram_count, sum_metric

pytestmark = pytest.mark.asyncio


class TestTimedIo:
    async def test_ok_emits_metric_with_status_and_duration(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.INFO, logger=IO_LOGGER_NAME):
            async with timed_io("t-1", TransportProtocols.HTTP, 1):
                pass

        assert len(caplog.records) == 1
        fields = caplog.records[0].__dict__
        assert fields["transport"] == "t-1"
        assert fields["protocol"] == TransportProtocols.HTTP
        assert fields["addresses"] == 1
        assert fields["status"] == "ok"
        assert isinstance(fields["duration_ms"], float)
        assert fields["duration_ms"] >= 0

    async def test_exception_emits_error_status_and_reraises(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        with (
            caplog.at_level(logging.INFO, logger=IO_LOGGER_NAME),
            pytest.raises(ValueError, match="boom"),
        ):
            async with timed_io("t-1", TransportProtocols.MODBUS_TCP, 5):
                raise ValueError("boom")

        assert len(caplog.records) == 1
        fields = caplog.records[0].__dict__
        assert fields["status"] == "error"
        assert fields["addresses"] == 5

    async def test_cancelled_transaction_emits_no_metric(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        # A cancelled read is an aborted transaction, not a measurement: it must
        # not be logged as ok (nor as a bogus error) with a truncated duration.
        with (
            caplog.at_level(logging.INFO, logger=IO_LOGGER_NAME),
            pytest.raises(asyncio.CancelledError),
        ):
            async with timed_io("t-1", TransportProtocols.HTTP, 1):
                raise asyncio.CancelledError

        assert caplog.records == []


class TestTimedIoMetrics:
    async def test_ok_records_duration_and_addresses(
        self, metric_reader: InMemoryMetricReader
    ) -> None:
        async with timed_io("t-1", TransportProtocols.HTTP, 3):
            pass

        assert (
            histogram_count(
                metric_reader,
                "device.io.read.duration",
                protocol=TransportProtocols.HTTP,
                status="ok",
            )
            == 1
        )
        assert (
            sum_metric(
                metric_reader,
                "device.io.read.addresses",
                protocol=TransportProtocols.HTTP,
                status="ok",
            )
            == 3
        )

    async def test_error_records_error_status(
        self, metric_reader: InMemoryMetricReader
    ) -> None:
        with pytest.raises(ValueError, match="boom"):
            async with timed_io("t-1", TransportProtocols.MODBUS_TCP, 5):
                raise ValueError("boom")

        assert (
            sum_metric(
                metric_reader,
                "device.io.read.addresses",
                protocol=TransportProtocols.MODBUS_TCP,
                status="error",
            )
            == 5
        )

    async def test_cancelled_transaction_records_no_metric(
        self, metric_reader: InMemoryMetricReader
    ) -> None:
        with pytest.raises(asyncio.CancelledError):
            async with timed_io("t-1", TransportProtocols.HTTP, 1):
                raise asyncio.CancelledError

        assert (
            sum_metric(
                metric_reader,
                "device.io.read.addresses",
                protocol=TransportProtocols.HTTP,
            )
            == 0
        )
