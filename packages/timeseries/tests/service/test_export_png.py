from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from models.errors import NotFoundError
from timeseries.domain import DataPoint, DataType
from timeseries.service import TimeSeriesService
from timeseries.storage import MemoryStorage

pytestmark = pytest.mark.asyncio

PNG_MAGIC = b"\x89PNG"


@pytest.fixture
def service() -> TimeSeriesService:
    return TimeSeriesService(storage=MemoryStorage())


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

    async def test_title_param(self, service: TimeSeriesService):
        series = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id="d1",
            metric="temperature",
        )
        t1 = datetime(2024, 1, 15, 8, 0, 0, tzinfo=UTC)
        await service.upsert_points(series.key, [DataPoint(timestamp=t1, value=20.5)])

        result = await service.export_png([series.id], title="My Chart")

        assert result[:4] == PNG_MAGIC

    async def test_empty_data_points(self, service: TimeSeriesService):
        series = await service.create_series(
            data_type=DataType.FLOAT,
            owner_id="d1",
            metric="temperature",
        )

        result = await service.export_png([series.id])

        assert result[:4] == PNG_MAGIC
