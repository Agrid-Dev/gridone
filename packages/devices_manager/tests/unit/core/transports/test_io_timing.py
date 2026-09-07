import asyncio

import pytest
from opentelemetry.sdk.metrics.export import InMemoryMetricReader

from devices_manager.core.transports.io_timing import timed_io
from devices_manager.types import TransportProtocols

from ...conftest import histogram_count, sum_metric

pytestmark = pytest.mark.asyncio


class TestTimedIoMetrics:
    async def test_ok_records_duration_and_addresses(
        self, metric_reader: InMemoryMetricReader
    ) -> None:
        async with timed_io(TransportProtocols.HTTP, 3):
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
            async with timed_io(TransportProtocols.MODBUS_TCP, 5):
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
            async with timed_io(TransportProtocols.HTTP, 1):
                raise asyncio.CancelledError

        assert (
            sum_metric(
                metric_reader,
                "device.io.read.addresses",
                protocol=TransportProtocols.HTTP,
            )
            == 0
        )
