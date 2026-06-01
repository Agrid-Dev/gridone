from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api.dependencies import (
    get_current_token_payload,
    get_device_manager,
    get_ts_service,
)
from api.exception_handlers import register_exception_handlers
from api.routes.devices_router import router
from models.errors import NotFoundError
from timeseries import TimeSeriesService
from timeseries.domain import (
    AggregationOperator,
    DataPoint,
    DataType,
    SeriesKey,
)

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

pytestmark = pytest.mark.asyncio

DEVICE_ID = "device-01"
ATTR = "temperature"
KEY = SeriesKey(owner_id=DEVICE_ID, metric=ATTR)


def _make_dm(known_ids: list[str] | None = None) -> MagicMock:
    """Return a DevicesServiceInterface mock that accepts known device IDs.

    Unknown IDs raise NotFoundError.
    """
    from devices_manager import DevicesServiceInterface

    known = set(known_ids or [DEVICE_ID])
    dm = MagicMock(spec=DevicesServiceInterface)

    def get_device(device_id: str) -> MagicMock:
        if device_id not in known:
            msg = f"Device '{device_id}' not found"
            raise NotFoundError(msg)
        return MagicMock(id=device_id)

    dm.get_device.side_effect = get_device
    return dm


@pytest_asyncio.fixture
async def ts_service() -> AsyncIterator[TimeSeriesService]:
    service = TimeSeriesService(storage_url=None)
    await service.start()
    yield service
    await service.stop()


@pytest.fixture
def app(ts_service: TimeSeriesService, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_ts_service] = lambda: ts_service
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_device_manager] = _make_dm
    return app


@pytest.fixture
def async_client(app: FastAPI) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# TestListDeviceTimeseries


class TestListDeviceTimeseries:
    async def test_empty(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get(f"/{DEVICE_ID}/timeseries")
        assert response.status_code == 200
        assert response.json() == []

    async def test_returns_series_for_device(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        async with async_client as ac:
            response = await ac.get(f"/{DEVICE_ID}/timeseries")
        assert response.status_code == 200
        series = response.json()
        assert len(series) == 1
        assert series[0]["owner_id"] == DEVICE_ID
        assert series[0]["metric"] == ATTR

    async def test_does_not_return_other_device_series(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id="other-device", metric=ATTR
        )
        async with async_client as ac:
            response = await ac.get(f"/{DEVICE_ID}/timeseries")
        assert response.status_code == 200
        assert all(s["owner_id"] == DEVICE_ID for s in response.json())

    async def test_metric_filter(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric="temperature"
        )
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric="humidity"
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries", params={"metric": "humidity"}
            )
        assert response.status_code == 200
        results = response.json()
        assert len(results) == 1
        assert results[0]["metric"] == "humidity"

    async def test_device_not_found_returns_404(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get("/nonexistent-device/timeseries")
        assert response.status_code == 404


# TestGetDeviceTimeseriesPoints


class TestGetDeviceTimeseriesPoints:
    async def test_device_not_found_returns_404(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get("/nonexistent-device/timeseries/temperature")
        assert response.status_code == 404

    async def test_attr_not_found_returns_404(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get(f"/{DEVICE_ID}/timeseries/nonexistent_attr")
        assert response.status_code == 404

    async def test_empty_points(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        async with async_client as ac:
            response = await ac.get(f"/{DEVICE_ID}/timeseries/{ATTR}")
        assert response.status_code == 200
        body = response.json()
        assert body["points"] == []
        assert body["truncated"] is False
        assert body["next_start"] is None

    async def test_returns_points(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        now = datetime.now(tz=UTC)
        await ts_service.upsert_points(KEY, [DataPoint(timestamp=now, value=23.5)])
        async with async_client as ac:
            response = await ac.get(f"/{DEVICE_ID}/timeseries/{ATTR}")
        assert response.status_code == 200
        body = response.json()
        assert len(body["points"]) == 1
        assert body["points"][0]["value"] == 23.5

    async def test_command_id_null_when_not_set(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        now = datetime.now(tz=UTC)
        await ts_service.upsert_points(KEY, [DataPoint(timestamp=now, value=1.0)])
        async with async_client as ac:
            response = await ac.get(f"/{DEVICE_ID}/timeseries/{ATTR}")
        assert response.json()["points"][0]["command_id"] is None

    async def test_command_id_in_response(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        now = datetime.now(tz=UTC)
        await ts_service.upsert_points(
            KEY, [DataPoint(timestamp=now, value=1.0, command_id=42)]
        )
        async with async_client as ac:
            response = await ac.get(f"/{DEVICE_ID}/timeseries/{ATTR}")
        assert response.json()["points"][0]["command_id"] == 42

    async def test_filter_start(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
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
                f"/{DEVICE_ID}/timeseries/{ATTR}", params={"start": t2.isoformat()}
            )
        assert response.status_code == 200
        points = response.json()["points"]
        assert len(points) == 2
        assert points[0]["value"] == 2.0
        assert points[1]["value"] == 3.0

    async def test_filter_end(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
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
                f"/{DEVICE_ID}/timeseries/{ATTR}", params={"end": t2.isoformat()}
            )
        assert response.status_code == 200
        points = response.json()["points"]
        assert len(points) == 2
        assert points[0]["value"] == 1.0
        assert points[1]["value"] == 2.0

    async def test_filter_last(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
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
                f"/{DEVICE_ID}/timeseries/{ATTR}", params={"last": "3h"}
            )
        assert response.status_code == 200
        points = response.json()["points"]
        assert len(points) == 1
        assert points[0]["value"] == 2.0

    async def test_carry_forward_prepends_point(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
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
                f"/{DEVICE_ID}/timeseries/{ATTR}",
                params={"start": t2.isoformat(), "carry_forward": "true"},
            )
        assert response.status_code == 200
        points = response.json()["points"]
        assert len(points) == 2
        assert points[0]["value"] == 1.0
        assert points[1]["value"] == 3.0

    async def test_carry_forward_false(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
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
                f"/{DEVICE_ID}/timeseries/{ATTR}",
                params={"start": t2.isoformat(), "carry_forward": "false"},
            )
        assert response.status_code == 200
        points = response.json()["points"]
        assert len(points) == 1
        assert points[0]["value"] == 3.0


class TestGetDeviceTimeseriesPointsTruncation:
    async def _setup(self, ts_service: TimeSeriesService, n: int) -> list[DataPoint]:
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        base = datetime(2026, 1, 1, tzinfo=UTC)
        pts = [
            DataPoint(timestamp=base + timedelta(minutes=i), value=float(i))
            for i in range(n)
        ]
        await ts_service.upsert_points(KEY, pts)
        return pts

    async def test_non_truncated_envelope_shape(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await self._setup(ts_service, 3)
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}", params={"limit": 10}
            )
        assert response.status_code == 200
        body = response.json()
        assert body["truncated"] is False
        assert body["next_start"] is None
        assert len(body["points"]) == 3

    async def test_truncated_envelope_shape(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        pts = await self._setup(ts_service, 5)
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}", params={"limit": 3}
            )
        assert response.status_code == 200
        body = response.json()
        assert body["truncated"] is True
        assert body["next_start"] is not None
        assert len(body["points"]) == 3
        assert datetime.fromisoformat(body["next_start"]) == pts[3].timestamp

    async def test_limit_exceeds_max_returns_422(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}", params={"limit": 100_001}
            )
        assert response.status_code == 422


# TestExportCsv


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
            response = await ac.get(
                "/timeseries/export/csv", params={"series_ids": series.id}
            )
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
            response = await ac.get(
                "/timeseries/export/csv", params={"series_ids": series.id}
            )
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
                "/timeseries/export/csv",
                params=[("series_ids", s1.id), ("series_ids", s2.id)],  # ty: ignore[invalid-argument-type]
            )
        assert response.status_code == 200
        lines = response.text.strip().splitlines()
        assert lines[0] == "timestamp,temperature,humidity"

    async def test_unknown_series_id_returns_404(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get(
                "/timeseries/export/csv", params={"series_ids": "nonexistent"}
            )
        assert response.status_code == 404

    async def test_missing_series_ids_returns_422(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get("/timeseries/export/csv")
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
                "/timeseries/export/csv",
                params={
                    "series_ids": series.id,
                    "start": t2.isoformat(),
                    "carry_forward": "true",
                },
            )
        assert response.status_code == 200
        lines = response.text.strip().splitlines()
        assert len(lines) == 3
        assert "10.0" in lines[1]
        assert "30.0" in lines[2]


# TestExportPng

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
        app.dependency_overrides[get_device_manager] = _make_dm
        return app

    @pytest.fixture
    def png_client(self, png_app: FastAPI) -> AsyncClient:
        return AsyncClient(transport=ASGITransport(app=png_app), base_url="http://test")

    async def test_returns_png_content_type(self, png_client: AsyncClient):
        async with png_client as ac:
            response = await ac.get(
                "/timeseries/export/png", params={"series_ids": "any-id"}
            )
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"

    async def test_returns_attachment_disposition(self, png_client: AsyncClient):
        async with png_client as ac:
            response = await ac.get(
                "/timeseries/export/png", params={"series_ids": "any-id"}
            )
        assert (
            response.headers["content-disposition"]
            == 'attachment; filename="export.png"'
        )

    async def test_returns_stub_bytes(self, png_client: AsyncClient):
        async with png_client as ac:
            response = await ac.get(
                "/timeseries/export/png", params={"series_ids": "any-id"}
            )
        assert response.content == DUMMY_PNG

    async def test_unknown_series_id_returns_404(
        self, png_client: AsyncClient, stub_ts: AsyncMock
    ):
        stub_ts.export_png.side_effect = NotFoundError("not found")
        async with png_client as ac:
            response = await ac.get(
                "/timeseries/export/png", params={"series_ids": "nonexistent"}
            )
        assert response.status_code == 404

    async def test_missing_series_ids_returns_422(self, png_client: AsyncClient):
        async with png_client as ac:
            response = await ac.get("/timeseries/export/png")
        assert response.status_code == 422


# TestOldPathsGone — verify old /timeseries/* paths no longer exist


class TestOldPathsGone:
    """Verify the old standalone /timeseries router paths return 404.

    Mounts devices_router at /devices (matching production) to confirm that
    the /timeseries prefix no longer routes to anything.
    """

    @pytest.fixture
    def full_app(self, ts_service: TimeSeriesService, admin_token_payload) -> FastAPI:
        app = FastAPI()
        register_exception_handlers(app)
        app.include_router(router, prefix="/devices")
        app.dependency_overrides[get_ts_service] = lambda: ts_service
        app.dependency_overrides[get_current_token_payload] = lambda: (
            admin_token_payload
        )
        app.dependency_overrides[get_device_manager] = _make_dm
        return app

    @pytest.fixture
    def full_client(self, full_app: FastAPI) -> AsyncClient:
        return AsyncClient(
            transport=ASGITransport(app=full_app), base_url="http://test"
        )

    async def test_old_list_series_path_gone(self, full_client: AsyncClient):
        async with full_client as ac:
            response = await ac.get("/timeseries/")
        assert response.status_code == 404

    async def test_old_get_points_path_gone(self, full_client: AsyncClient):
        async with full_client as ac:
            response = await ac.get("/timeseries/some-series-id/points")
        assert response.status_code == 404

    async def test_old_export_csv_path_gone(self, full_client: AsyncClient):
        async with full_client as ac:
            response = await ac.get(
                "/timeseries/export/csv", params={"series_ids": "any"}
            )
        assert response.status_code == 404

    async def test_old_export_png_path_gone(self, full_client: AsyncClient):
        async with full_client as ac:
            response = await ac.get(
                "/timeseries/export/png", params={"series_ids": "any"}
            )
        assert response.status_code == 404


# TestGetDeviceTimeseriesAggregate

AGG_PARAMS = {"interval": "1h", "agg": "avg"}
AGG_START = datetime(2026, 1, 1, tzinfo=UTC)
AGG_END = datetime(2026, 1, 2, tzinfo=UTC)


class TestGetDeviceTimeseriesAggregate:
    async def test_device_not_found_returns_404(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get(
                "/nonexistent-device/timeseries/temperature/aggregate",
                params={
                    **AGG_PARAMS,
                    "start": AGG_START.isoformat(),
                    "end": AGG_END.isoformat(),
                },
            )
        assert response.status_code == 404

    async def test_attr_not_found_returns_404(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/nonexistent/aggregate",
                params={
                    **AGG_PARAMS,
                    "start": AGG_START.isoformat(),
                    "end": AGG_END.isoformat(),
                },
            )
        assert response.status_code == 404

    async def test_interval_is_optional_defaults_to_auto(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}/aggregate",
                params={
                    "agg": "avg",
                    "start": AGG_START.isoformat(),
                    "end": AGG_END.isoformat(),
                },
            )
        assert response.status_code == 200
        body = response.json()
        assert "interval" in body
        assert "truncated" in body

    async def test_missing_agg_returns_422(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}/aggregate",
                params={
                    "interval": "1h",
                    "start": AGG_START.isoformat(),
                    "end": AGG_END.isoformat(),
                },
            )
        assert response.status_code == 422

    async def test_invalid_last_returns_422(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}/aggregate",
                params={**AGG_PARAMS, "last": "notaduration"},
            )
        assert response.status_code == 422

    async def test_no_time_range_returns_422(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}/aggregate",
                params=AGG_PARAMS,
            )
        assert response.status_code == 422

    async def test_incompatible_operator_returns_422(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.STRING, owner_id=DEVICE_ID, metric=ATTR
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}/aggregate",
                params={
                    **AGG_PARAMS,
                    "start": AGG_START.isoformat(),
                    "end": AGG_END.isoformat(),
                },
            )
        assert response.status_code == 422

    async def test_returns_aggregated_result(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        await ts_service.upsert_points(
            KEY,
            [
                DataPoint(timestamp=datetime(2026, 1, 1, 10, tzinfo=UTC), value=10.0),
                DataPoint(timestamp=datetime(2026, 1, 1, 11, tzinfo=UTC), value=20.0),
            ],
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}/aggregate",
                params={
                    **AGG_PARAMS,
                    "start": AGG_START.isoformat(),
                    "end": AGG_END.isoformat(),
                },
            )
        assert response.status_code == 200
        body = response.json()
        assert body["interval"] == "1h"
        assert body["agg"] == AggregationOperator.AVG
        assert body["data_type"] == DataType.FLOAT
        assert body["aggregation_data_type"] == DataType.FLOAT
        assert body["timezone"] == "UTC"
        assert body["truncated"] is False
        filled = [p for p in body["points"] if p["count"] > 0]
        assert len(filled) == 2
        assert filled[0]["value"] == 10.0
        assert filled[1]["value"] == 20.0

    async def test_empty_result_when_no_points_in_range(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}/aggregate",
                params={
                    **AGG_PARAMS,
                    "start": AGG_START.isoformat(),
                    "end": AGG_END.isoformat(),
                },
            )
        assert response.status_code == 200
        body = response.json()
        assert len(body["points"]) == 24
        assert all(p["count"] == 0 for p in body["points"])

    async def test_naive_datetimes_interpreted_as_service_timezone(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        # ts_service default_timezone is "UTC" so naive == UTC in this context
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}/aggregate",
                params={
                    **AGG_PARAMS,
                    "start": "2026-01-01T00:00:00",
                    "end": "2026-01-02T00:00:00",
                },
            )
        assert response.status_code == 200

    async def test_last_alone_returns_200(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        """?last=2h without start/end must succeed (previously returned 422)."""
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}/aggregate",
                params={**AGG_PARAMS, "last": "2h"},
            )
        assert response.status_code == 200

    async def test_timezone_param_shifts_response_timestamps(
        self, async_client: AsyncClient, ts_service: TimeSeriesService
    ):
        """?timezone= must be visible in interval_start offsets (non-regression)."""
        await ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}/aggregate",
                params={
                    **AGG_PARAMS,
                    "start": "2026-01-01T00:00:00Z",
                    "end": "2026-01-02T00:00:00Z",
                    "timezone": "Asia/Kolkata",
                },
            )
        assert response.status_code == 200
        body = response.json()
        assert body["timezone"] == "Asia/Kolkata"
        for pt in body["points"]:
            ts_str = pt["interval_start"]
            assert ts_str.endswith("+05:30"), f"expected +05:30 offset, got {ts_str}"


# Timezone rendering tests — need a service with a non-UTC default_timezone


@pytest_asyncio.fixture
async def paris_ts_service() -> AsyncIterator[TimeSeriesService]:
    svc = TimeSeriesService(storage_url=None, default_timezone="Europe/Paris")
    await svc.start()
    yield svc
    await svc.stop()


@pytest.fixture
def paris_app(paris_ts_service: TimeSeriesService, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_ts_service] = lambda: paris_ts_service
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_device_manager] = _make_dm
    return app


@pytest.fixture
def paris_client(paris_app: FastAPI) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=paris_app), base_url="http://test")


class TestAggregateTimezoneRendering:
    async def test_interval_start_rendered_with_paris_offset(
        self,
        paris_client: AsyncClient,
        paris_ts_service: TimeSeriesService,
    ):
        """interval_start must carry the +01:00 CET offset, not bare Z."""
        await paris_ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        async with paris_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}/aggregate",
                params={
                    **AGG_PARAMS,
                    "start": "2026-01-01T00:00:00Z",
                    "end": "2026-01-02T00:00:00Z",
                },
            )
        assert response.status_code == 200
        body = response.json()
        assert body["timezone"] == "Europe/Paris"
        for pt in body["points"]:
            ts_str = pt["interval_start"]
            assert ts_str.endswith("+01:00"), f"expected +01:00, got {ts_str}"

    async def test_timezone_field_matches_offset(
        self,
        paris_client: AsyncClient,
        paris_ts_service: TimeSeriesService,
    ):
        """timezone field in body must match the UTC offset rendered in
        interval_start.
        """
        await paris_ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        async with paris_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}/aggregate",
                params={
                    **AGG_PARAMS,
                    "start": "2026-01-01T00:00:00Z",
                    "end": "2026-01-02T00:00:00Z",
                    "timezone": "Asia/Kolkata",
                },
            )
        assert response.status_code == 200
        body = response.json()
        assert body["timezone"] == "Asia/Kolkata"
        for pt in body["points"]:
            assert pt["interval_start"].endswith("+05:30")

    async def test_invalid_timezone_aggregate_returns_422(
        self,
        paris_client: AsyncClient,
        paris_ts_service: TimeSeriesService,
    ):
        """Invalid ?timezone= on aggregate must emit the same clean message
        as raw-points.
        """
        await paris_ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        async with paris_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}/aggregate",
                params={
                    **AGG_PARAMS,
                    "start": "2026-01-01T00:00:00Z",
                    "end": "2026-01-02T00:00:00Z",
                    "timezone": "Not/ATimezone",
                },
            )
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert "Value error" not in detail
        assert "Unknown IANA timezone" in detail


class TestGetDeviceTimeseriesPointsRendering:
    """Raw-points timestamps must render in the resolved timezone."""

    async def test_timestamps_rendered_in_service_timezone(
        self,
        paris_client: AsyncClient,
        paris_ts_service: TimeSeriesService,
    ):
        await paris_ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        t = datetime(2026, 1, 16, 0, 0, 0, tzinfo=UTC)  # Paris 01:00 CET
        await paris_ts_service.upsert_points(KEY, [DataPoint(timestamp=t, value=22.5)])
        async with paris_client as ac:
            response = await ac.get(f"/{DEVICE_ID}/timeseries/{ATTR}")
        assert response.status_code == 200
        ts_str = response.json()["points"][0]["timestamp"]
        assert ts_str.endswith("+01:00"), f"expected +01:00 offset, got {ts_str}"

    async def test_timezone_param_overrides_service_default(
        self,
        paris_client: AsyncClient,
        paris_ts_service: TimeSeriesService,
    ):
        await paris_ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        t = datetime(2026, 1, 16, 0, 0, 0, tzinfo=UTC)
        await paris_ts_service.upsert_points(KEY, [DataPoint(timestamp=t, value=22.5)])
        async with paris_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}", params={"timezone": "UTC"}
            )
        assert response.status_code == 200
        ts_str = response.json()["points"][0]["timestamp"]
        assert "+00:00" in ts_str or ts_str.endswith("Z"), (
            f"expected UTC offset, got {ts_str}"
        )

    async def test_invalid_timezone_returns_422(
        self,
        paris_client: AsyncClient,
        paris_ts_service: TimeSeriesService,
    ):
        await paris_ts_service.create_series(
            data_type=DataType.FLOAT, owner_id=DEVICE_ID, metric=ATTR
        )
        async with paris_client as ac:
            response = await ac.get(
                f"/{DEVICE_ID}/timeseries/{ATTR}", params={"timezone": "Not/ATimezone"}
            )
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert "Value error" not in detail
        assert "Unknown IANA timezone" in detail


class TestAggregateOptions:
    async def test_no_period_returns_full_set_with_null_counts(
        self, async_client: AsyncClient
    ):
        async with async_client as ac:
            response = await ac.get("/timeseries/aggregate/options")
        assert response.status_code == 200
        body = response.json()
        assert body["recommended_interval"] is None
        intervals = body["intervals"]
        assert intervals[0]["interval"] == "raw"
        assert all(iv["bucket_count"] is None for iv in intervals)
        assert "operators_by_data_type" in body
        assert "auto_interval_lookup" not in body

    async def test_7d_period_filters_intervals_and_recommends(
        self, async_client: AsyncClient
    ):
        start = datetime(2026, 1, 1, tzinfo=UTC)
        end = datetime(2026, 1, 8, tzinfo=UTC)
        async with async_client as ac:
            response = await ac.get(
                "/timeseries/aggregate/options",
                params={"start": start.isoformat(), "end": end.isoformat()},
            )
        assert response.status_code == 200
        body = response.json()
        # 7d: 1h gives 168 buckets (diff=32 from TARGET=200), closest among valid
        assert body["recommended_interval"] == "1h"
        interval_names = [iv["interval"] for iv in body["intervals"]]
        assert interval_names == ["raw", "15min", "1h", "1d"]
        # bucket counts populated for non-raw entries
        for iv in body["intervals"]:
            if iv["interval"] != "raw":
                assert iv["bucket_count"] is not None

    async def test_last_param_computes_period(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get(
                "/timeseries/aggregate/options", params={"last": "7d"}
            )
        assert response.status_code == 200
        body = response.json()
        assert body["recommended_interval"] == "1h"

    async def test_operators_by_data_type_contains_all_types(
        self, async_client: AsyncClient
    ):
        async with async_client as ac:
            response = await ac.get("/timeseries/aggregate/options")
        body = response.json()
        ops_by_type = body["operators_by_data_type"]
        assert set(ops_by_type.keys()) == {"float", "int", "str", "bool"}
        assert "avg" in ops_by_type["float"]
        assert "avg" not in ops_by_type["str"]

    async def test_end_only_returns_422(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get(
                "/timeseries/aggregate/options",
                params={"end": datetime(2026, 1, 8, tzinfo=UTC).isoformat()},
            )
        assert response.status_code == 422
