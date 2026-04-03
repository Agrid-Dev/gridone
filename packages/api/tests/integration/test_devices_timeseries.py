import pytest
from devices_manager import DevicesManager, VirtualDevice
from devices_manager.core.device import Attribute
from devices_manager.types import DataType
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from timeseries.domain import SeriesKey
from timeseries.service import TimeSeriesService
from timeseries.storage import MemoryStorage

from api.dependencies import (
    get_current_token_payload,
    get_current_user_id,
    get_device_manager,
    get_ts_service,
)
from api.exception_handlers import register_exception_handlers
from api.routes.devices_router import router

pytestmark = pytest.mark.asyncio

DEVICE_ID = "vd-int"
TEMPERATURE = "temperature"
SETPOINT = "setpoint"


@pytest.fixture
def virtual_device() -> VirtualDevice:
    return VirtualDevice(
        id=DEVICE_ID,
        name="Integration Sensor",
        attributes={
            TEMPERATURE: Attribute.create(TEMPERATURE, DataType.FLOAT, {"read"}),
            SETPOINT: Attribute.create(SETPOINT, DataType.FLOAT, {"read", "write"}),
        },
    )


@pytest.fixture
def ts_service() -> TimeSeriesService:
    return TimeSeriesService(storage=MemoryStorage())


@pytest.fixture
def integration_app(
    virtual_device: VirtualDevice,
    ts_service: TimeSeriesService,
    admin_token_payload,
) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    dm = DevicesManager(
        devices={virtual_device.id: virtual_device},
        drivers={},
        transports={},
    )
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_ts_service] = lambda: ts_service
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    return app


@pytest.fixture
def client(integration_app: FastAPI) -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=integration_app), base_url="http://test"
    )


class TestBulkPushIntegration:
    async def test_pushed_points_are_queryable(
        self, client: AsyncClient, ts_service: TimeSeriesService
    ):
        payload = {
            "data": [
                {
                    "attribute": TEMPERATURE,
                    "timestamp": "2026-01-15T10:00:00Z",
                    "value": 20.5,
                },
                {
                    "attribute": TEMPERATURE,
                    "timestamp": "2026-01-15T11:00:00Z",
                    "value": 21.0,
                },
                {
                    "attribute": SETPOINT,
                    "timestamp": "2026-01-15T10:00:00Z",
                    "value": 22.0,
                },
            ]
        }
        async with client as ac:
            response = await ac.post(f"/{DEVICE_ID}/timeseries", json=payload)
        assert response.status_code == 204

        temp_points = await ts_service.fetch_points(
            SeriesKey(owner_id=DEVICE_ID, metric=TEMPERATURE)
        )
        assert len(temp_points) == 2
        assert {p.value for p in temp_points} == {20.5, 21.0}

        setpoint_points = await ts_service.fetch_points(
            SeriesKey(owner_id=DEVICE_ID, metric=SETPOINT)
        )
        assert len(setpoint_points) == 1
        assert setpoint_points[0].value == 22.0

    async def test_no_command_id_on_pushed_points(
        self, client: AsyncClient, ts_service: TimeSeriesService
    ):
        """History push must not create DeviceCommand entries."""
        async with client as ac:
            await ac.post(
                f"/{DEVICE_ID}/timeseries",
                json={
                    "data": [
                        {
                            "attribute": TEMPERATURE,
                            "timestamp": "2026-01-15T10:00:00Z",
                            "value": 19.0,
                        }
                    ]
                },
            )
        points = await ts_service.fetch_points(
            SeriesKey(owner_id=DEVICE_ID, metric=TEMPERATURE)
        )
        assert all(p.command_id is None for p in points)

    async def test_does_not_update_device_state(
        self, client: AsyncClient, virtual_device: VirtualDevice
    ):
        """History push must not change the device's in-memory attribute values."""
        original_value = virtual_device.attributes[TEMPERATURE].current_value
        async with client as ac:
            await ac.post(
                f"/{DEVICE_ID}/timeseries",
                json={
                    "data": [
                        {
                            "attribute": TEMPERATURE,
                            "timestamp": "2026-01-15T10:00:00Z",
                            "value": 99.9,
                        }
                    ]
                },
            )
        assert virtual_device.attributes[TEMPERATURE].current_value == original_value


class TestSingleAttrPushIntegration:
    async def test_pushed_points_are_queryable(
        self, client: AsyncClient, ts_service: TimeSeriesService
    ):
        payload = {
            "data": [
                {"timestamp": "2026-02-01T08:00:00Z", "value": 18.5},
                {"timestamp": "2026-02-01T09:00:00Z", "value": 19.0},
            ]
        }
        async with client as ac:
            response = await ac.post(
                f"/{DEVICE_ID}/timeseries/{TEMPERATURE}", json=payload
            )
        assert response.status_code == 204

        points = await ts_service.fetch_points(
            SeriesKey(owner_id=DEVICE_ID, metric=TEMPERATURE)
        )
        assert len(points) == 2
        assert {p.value for p in points} == {18.5, 19.0}

    async def test_correct_series_key_used(
        self, client: AsyncClient, ts_service: TimeSeriesService
    ):
        async with client as ac:
            await ac.post(
                f"/{DEVICE_ID}/timeseries/{SETPOINT}",
                json={"data": [{"timestamp": "2026-02-01T08:00:00Z", "value": 23.0}]},
            )
        series = await ts_service.get_series_by_key(
            SeriesKey(owner_id=DEVICE_ID, metric=SETPOINT)
        )
        assert series is not None
        assert series.owner_id == DEVICE_ID
        assert series.metric == SETPOINT
