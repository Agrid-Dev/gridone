from __future__ import annotations

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from timeseries import TimeSeriesService, create_service
from timeseries.domain import DataPoint, DataType, SeriesKey

from api.dependencies import get_ts_service
from api.exception_handlers import register_exception_handlers
from api.routes.timeseries_router import router

pytestmark = pytest.mark.asyncio

KEY = SeriesKey(owner_id="device-01", metric="temperature")


@pytest_asyncio.fixture
async def ts_service() -> TimeSeriesService:
    return await create_service()


@pytest.fixture
def app(ts_service: TimeSeriesService) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_ts_service] = lambda: ts_service
    return app


@pytest.fixture
def async_client(app: FastAPI) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestListSeries:
    async def test_empty(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get("/")
        assert response.status_code == 200
        assert response.json() == []

    async def test_returns_series(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        async with async_client as ac:
            response = await ac.get("/")
        assert response.status_code == 200
        series = response.json()
        assert len(series) == 1
        assert series[0]["owner_id"] == KEY.owner_id
        assert series[0]["metric"] == KEY.metric

    async def test_filter_owner_id(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="temp"
        )
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id="d2", metric="temp"
        )
        async with async_client as ac:
            response = await ac.get("/", params={"owner_id": "d1"})
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["owner_id"] == "d1"

    async def test_filter_metric(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="temp"
        )
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="humidity"
        )
        async with async_client as ac:
            response = await ac.get("/", params={"metric": "humidity"})
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["metric"] == "humidity"

    async def test_filter_combined(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="temp"
        )
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="humidity"
        )
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id="d2", metric="temp"
        )
        async with async_client as ac:
            response = await ac.get("/", params={"owner_id": "d1", "metric": "temp"})
        assert response.status_code == 200
        results = response.json()
        assert len(results) == 1
        assert results[0]["owner_id"] == "d1"
        assert results[0]["metric"] == "temp"


class TestGetPoints:
    async def test_not_found(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get("/nonexistent/points")
        assert response.status_code == 404

    async def test_empty_points(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        series = await ts_service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        async with async_client as ac:
            response = await ac.get(f"/{series.id}/points")
        assert response.status_code == 200
        assert response.json() == []

    async def test_returns_points(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        series = await ts_service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        now = datetime.now(tz=UTC)
        await ts_service.upsert_points(KEY, [DataPoint(timestamp=now, value=23.5)])
        async with async_client as ac:
            response = await ac.get(f"/{series.id}/points")
        assert response.status_code == 200
        points = response.json()
        assert len(points) == 1
        assert points[0]["value"] == 23.5

    async def test_filter_start(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        series = await ts_service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await ts_service.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t2, value=2.0),
                DataPoint(timestamp=t3, value=3.0),
            ],
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{series.id}/points",
                params={"start": t2.isoformat()},
            )
        assert response.status_code == 200
        points = response.json()
        assert len(points) == 2
        assert points[0]["value"] == 2.0
        assert points[1]["value"] == 3.0

    async def test_filter_end(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        series = await ts_service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await ts_service.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t2, value=2.0),
                DataPoint(timestamp=t3, value=3.0),
            ],
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{series.id}/points",
                params={"end": t2.isoformat()},
            )
        assert response.status_code == 200
        points = response.json()
        assert len(points) == 2
        assert points[0]["value"] == 1.0
        assert points[1]["value"] == 2.0

    async def test_filter_range(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        series = await ts_service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await ts_service.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t2, value=2.0),
                DataPoint(timestamp=t3, value=3.0),
            ],
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{series.id}/points",
                params={"start": t2.isoformat(), "end": t2.isoformat()},
            )
        assert response.status_code == 200
        points = response.json()
        assert len(points) == 1
        assert points[0]["value"] == 2.0
