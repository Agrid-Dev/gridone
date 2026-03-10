from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from models.errors import NotFoundError
from timeseries import TimeSeriesService, create_service
from timeseries.domain import DataPoint, DataType, SeriesKey

from api.dependencies import get_current_token_payload, get_ts_service
from api.exception_handlers import register_exception_handlers
from api.routes.timeseries_router import router

pytestmark = pytest.mark.asyncio

KEY = SeriesKey(owner_id="device-01", metric="temperature")


@pytest_asyncio.fixture
async def ts_service() -> TimeSeriesService:
    return await create_service()


@pytest.fixture
def app(ts_service: TimeSeriesService, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_ts_service] = lambda: ts_service
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
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

    async def test_command_id_null_when_not_set(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        series = await ts_service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        now = datetime.now(tz=UTC)
        await ts_service.upsert_points(KEY, [DataPoint(timestamp=now, value=1.0)])
        async with async_client as ac:
            response = await ac.get(f"/{series.id}/points")
        assert response.json()[0]["command_id"] is None

    async def test_command_id_in_response(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        series = await ts_service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        now = datetime.now(tz=UTC)
        await ts_service.upsert_points(
            KEY, [DataPoint(timestamp=now, value=1.0, command_id=42)]
        )
        async with async_client as ac:
            response = await ac.get(f"/{series.id}/points")
        assert response.json()[0]["command_id"] == 42

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

    async def test_filter_last(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        series = await ts_service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        now = datetime.now(tz=UTC)
        old = now - timedelta(hours=5)
        await ts_service.upsert_points(
            KEY,
            [
                DataPoint(timestamp=old, value=1.0),
                DataPoint(timestamp=now, value=2.0),
            ],
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{series.id}/points",
                params={"last": "3h"},
            )
        assert response.status_code == 200
        points = response.json()
        assert len(points) == 1
        assert points[0]["value"] == 2.0

    async def test_carry_forward_prepends_point(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        series = await ts_service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 3, tzinfo=UTC)
        t3 = datetime(2026, 1, 4, tzinfo=UTC)
        await ts_service.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t3, value=3.0),
            ],
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{series.id}/points",
                params={"start": t2.isoformat(), "carry_forward": "true"},
            )
        assert response.status_code == 200
        points = response.json()
        assert len(points) == 2
        assert points[0]["value"] == 1.0
        assert points[1]["value"] == 3.0

    async def test_carry_forward_false(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        series = await ts_service.create_series(
            data_type=DataType.FLOAT,
            owner_id=KEY.owner_id,
            metric=KEY.metric,
        )
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 3, tzinfo=UTC)
        t3 = datetime(2026, 1, 4, tzinfo=UTC)
        await ts_service.upsert_points(
            KEY,
            [
                DataPoint(timestamp=t1, value=1.0),
                DataPoint(timestamp=t3, value=3.0),
            ],
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{series.id}/points",
                params={"start": t2.isoformat(), "carry_forward": "false"},
            )
        assert response.status_code == 200
        points = response.json()
        assert len(points) == 1
        assert points[0]["value"] == 3.0


class TestExportCsv:
    async def test_returns_csv_content_type(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        series = await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="temperature"
        )
        t1 = datetime(2024, 1, 1, tzinfo=UTC)
        await ts_service.upsert_points(
            series.key, [DataPoint(timestamp=t1, value=20.5)]
        )
        async with async_client as ac:
            response = await ac.get("/export/csv", params={"series_ids": series.id})
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        assert "attachment" in response.headers["content-disposition"]

    async def test_csv_header_and_row(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        series = await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="temperature"
        )
        t1 = datetime(2024, 1, 1, tzinfo=UTC)
        await ts_service.upsert_points(
            series.key, [DataPoint(timestamp=t1, value=20.5)]
        )
        async with async_client as ac:
            response = await ac.get("/export/csv", params={"series_ids": series.id})
        lines = response.text.strip().splitlines()
        assert lines[0] == "timestamp,temperature"
        assert "20.5" in lines[1]

    async def test_multiple_series_ids(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        s1 = await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="temperature"
        )
        s2 = await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="humidity"
        )
        t1 = datetime(2024, 1, 1, tzinfo=UTC)
        await ts_service.upsert_points(s1.key, [DataPoint(timestamp=t1, value=21.0)])
        await ts_service.upsert_points(s2.key, [DataPoint(timestamp=t1, value=60.0)])
        async with async_client as ac:
            response = await ac.get(
                "/export/csv",
                params=[("series_ids", s1.id), ("series_ids", s2.id)],
            )
        assert response.status_code == 200
        lines = response.text.strip().splitlines()
        assert lines[0] == "timestamp,temperature,humidity"

    async def test_unknown_series_id_returns_404(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get("/export/csv", params={"series_ids": "nonexistent"})
        assert response.status_code == 404

    async def test_missing_series_ids_returns_422(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get("/export/csv")
        assert response.status_code == 422

    async def test_carry_forward_param(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        series = await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id="d1", metric="temperature"
        )
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await ts_service.upsert_points(
            series.key,
            [
                DataPoint(timestamp=t1, value=10.0),
                DataPoint(timestamp=t3, value=30.0),
            ],
        )
        async with async_client as ac:
            response = await ac.get(
                "/export/csv",
                params={
                    "series_ids": series.id,
                    "start": t2.isoformat(),
                    "carry_forward": "true",
                },
            )
        assert response.status_code == 200
        lines = response.text.strip().splitlines()
        # header + row at t2 (carry_forward seed 10.0) + row at t3 (30.0)
        assert len(lines) == 3
        assert "10.0" in lines[1]
        assert "30.0" in lines[2]


DUMMY_PNG = b"\x89PNG\r\n\x1a\n"


class TestExportPng:
    @pytest.fixture
    def stub_ts(self) -> AsyncMock:
        mock = AsyncMock()
        mock.export_png.return_value = DUMMY_PNG
        return mock

    @pytest.fixture
    def png_app(self, stub_ts: AsyncMock, admin_token_payload) -> FastAPI:
        app = FastAPI()
        register_exception_handlers(app)
        app.include_router(router)
        app.dependency_overrides[get_ts_service] = lambda: stub_ts
        app.dependency_overrides[get_current_token_payload] = lambda: (
            admin_token_payload
        )
        return app

    @pytest.fixture
    def png_client(self, png_app: FastAPI) -> AsyncClient:
        return AsyncClient(transport=ASGITransport(app=png_app), base_url="http://test")

    async def test_returns_png_content_type(self, png_client: AsyncClient):
        async with png_client as ac:
            response = await ac.get("/export/png", params={"series_ids": "any-id"})
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"

    async def test_returns_attachment_disposition(self, png_client: AsyncClient):
        async with png_client as ac:
            response = await ac.get("/export/png", params={"series_ids": "any-id"})
        assert (
            response.headers["content-disposition"]
            == 'attachment; filename="export.png"'
        )

    async def test_returns_stub_bytes(self, png_client: AsyncClient):
        async with png_client as ac:
            response = await ac.get("/export/png", params={"series_ids": "any-id"})
        assert response.content == DUMMY_PNG

    async def test_unknown_series_id_returns_404(
        self, png_client: AsyncClient, stub_ts: AsyncMock
    ):
        stub_ts.export_png.side_effect = NotFoundError("not found")
        async with png_client as ac:
            response = await ac.get("/export/png", params={"series_ids": "nonexistent"})
        assert response.status_code == 404

    async def test_missing_series_ids_returns_422(self, png_client: AsyncClient):
        async with png_client as ac:
            response = await ac.get("/export/png")
        assert response.status_code == 422
