from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
import pytest_asyncio

from models.errors import NotFoundError
from timeseries.domain import DataPoint, DataType
from timeseries.service import TimeSeriesService

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

pytestmark = pytest.mark.asyncio

PNG_MAGIC = b"\x89PNG"


@pytest_asyncio.fixture
async def service() -> AsyncIterator[TimeSeriesService]:
    service = TimeSeriesService(storage_url=None)
    await service.start()
    yield service
    await service.stop()


class TestExportPng:
    async def test_returns_png_bytes(self, service: TimeSeriesService):
        series = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id="d1",
            metric="temperature",
        )
        t1 = datetime(2024, 1, 15, 8, 0, 0, tzinfo=UTC)
        await service.upsert_points(series.key, [DataPoint(timestamp=t1, value=20.5)])

        result = await service.export_png([series.id])

        assert isinstance(result, bytes)
        assert result[:4] == PNG_MAGIC

    async def test_unknown_series_id_raises(self, service: TimeSeriesService):
        with pytest.raises(NotFoundError):
            await service.export_png(["nonexistent"])

    async def test_paris_timezone_produces_png(self):
        t1 = datetime(2026, 1, 15, 10, 0, 0, tzinfo=UTC)
        svc = TimeSeriesService(storage_url=None, default_timezone="Europe/Paris")
        await svc.start()
        try:
            s = await svc.create_series(
                data_type=DataType.FLOAT, owner_id="d1", metric="temp"
            )
            await svc.upsert_points(s.key, [DataPoint(timestamp=t1, value=20.5)])
            result = await svc.export_png([s.id])
            assert isinstance(result, bytes)
            assert result[:4] == PNG_MAGIC
        finally:
            await svc.stop()

    async def test_last_param_resolves(self, service: TimeSeriesService):
        series = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id="d1",
            metric="temperature",
        )
        now = datetime.now(tz=UTC)
        old = now - timedelta(hours=5)
        recent = now - timedelta(hours=1)
        await service.upsert_points(
            series.key,
            [
                DataPoint(timestamp=old, value=1.0),
                DataPoint(timestamp=recent, value=2.0),
            ],
        )

        result = await service.export_png([series.id], last="3h")

        assert result[:4] == PNG_MAGIC
