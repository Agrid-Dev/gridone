import asyncio

import pytest

from devices_manager.core.transports.io_timing import timed_io
from devices_manager.types import TransportProtocols

from ...conftest import RecordedMetrics

pytestmark = pytest.mark.asyncio


class TestTimedIoMetrics:
    async def test_ok_records_duration_and_addresses(
        self, metrics: RecordedMetrics
    ) -> None:
        async with timed_io(TransportProtocols.HTTP, 3):
            pass

        assert (
            metrics.read_duration.count(
                protocol=TransportProtocols.HTTP,
                status="ok",
            )
            == 1
        )
        assert (
            metrics.read_addresses.total(
                protocol=TransportProtocols.HTTP,
                status="ok",
            )
            == 3
        )

    async def test_error_records_error_status(self, metrics: RecordedMetrics) -> None:
        with pytest.raises(ValueError, match="boom"):
            async with timed_io(TransportProtocols.MODBUS_TCP, 5):
                raise ValueError("boom")

        assert (
            metrics.read_addresses.total(
                protocol=TransportProtocols.MODBUS_TCP,
                status="error",
            )
            == 5
        )

    async def test_cancelled_transaction_records_no_metric(
        self, metrics: RecordedMetrics
    ) -> None:
        with pytest.raises(asyncio.CancelledError):
            async with timed_io(TransportProtocols.HTTP, 1):
                raise asyncio.CancelledError

        assert (
            metrics.read_addresses.total(
                protocol=TransportProtocols.HTTP,
            )
            == 0
        )
