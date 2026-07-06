from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api.dependencies import (
    get_current_token_payload,
    get_current_user_id,
    get_device_manager,
    get_ts_service,
)
from api.exception_handlers import register_exception_handlers
from api.routes.devices_router import router
from devices_manager import CoreDevice, DeviceBase, DevicesService, Driver
from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.driver import (
    AttributeDriver,
    DriverMetadata,
    UpdateStrategy,
)
from devices_manager.core.transports import TransportMetadata
from devices_manager.core.transports.http_transport import (
    HTTPTransportClient,
    HttpTransportConfig,
)
from devices_manager.types import DataType, TransportProtocols
from timeseries.domain import SeriesKey
from timeseries.service import TimeSeriesService

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

pytestmark = pytest.mark.asyncio

DEVICE_ID = "dev-int"
TEMPERATURE = "temperature"
SETPOINT = "setpoint"
INITIAL_TEMPERATURE = 20.0


@pytest.fixture
def driver() -> Driver:
    # Polling is disabled so the seeded device never reads from its
    # transport during the test — attribute values only change if the
    # API mutates the runtime device state.
    return Driver(
        metadata=DriverMetadata(id="integration_driver"),
        env={},
        transport=TransportProtocols.HTTP,
        device_config_required=[],
        update_strategy=UpdateStrategy(polling_enabled=False),
        attributes={
            TEMPERATURE: AttributeDriver(
                name=TEMPERATURE,
                data_type=DataType.FLOAT,
                read=f"GET /{TEMPERATURE}",
                write=None,
                codecs=[CodecSpec(name="identity", argument="")],
            ),
            SETPOINT: AttributeDriver(
                name=SETPOINT,
                data_type=DataType.FLOAT,
                read=f"GET /{SETPOINT}",
                write=f"POST /{SETPOINT}",
                codecs=[CodecSpec(name="identity", argument="")],
            ),
        },
    )


@pytest.fixture
def transport() -> HTTPTransportClient:
    return HTTPTransportClient(
        TransportMetadata(id="http-int", name="Integration HTTP"),
        HttpTransportConfig(),
    )


@pytest.fixture
def device(driver: Driver, transport: HTTPTransportClient) -> CoreDevice:
    return CoreDevice.from_base(
        DeviceBase(id=DEVICE_ID, name="Integration Sensor", config={}),
        driver=driver,
        transport=transport,
        initial_values={TEMPERATURE: INITIAL_TEMPERATURE},
    )


@pytest_asyncio.fixture
async def ts_service() -> AsyncIterator[TimeSeriesService]:
    service = TimeSeriesService(storage_url=None)
    await service.start()
    yield service
    await service.stop()


@pytest_asyncio.fixture
async def integration_app(
    device: CoreDevice,
    driver: Driver,
    transport: HTTPTransportClient,
    ts_service: TimeSeriesService,
    admin_token_payload,
) -> AsyncIterator[FastAPI]:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    dm = DevicesService(
        drivers={driver.id: driver},
        transports={transport.id: transport},
        devices={device.id: device},
    )
    await dm.start()
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_ts_service] = lambda: ts_service
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    try:
        yield app
    finally:
        await dm.stop()


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

        temp_result = await ts_service.fetch_points(
            SeriesKey(owner_id=DEVICE_ID, metric=TEMPERATURE)
        )
        assert len(temp_result.points) == 2
        assert {p.value for p in temp_result.points} == {20.5, 21.0}

        setpoint_result = await ts_service.fetch_points(
            SeriesKey(owner_id=DEVICE_ID, metric=SETPOINT)
        )
        assert len(setpoint_result.points) == 1
        assert setpoint_result.points[0].value == 22.0

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
        result = await ts_service.fetch_points(
            SeriesKey(owner_id=DEVICE_ID, metric=TEMPERATURE)
        )
        assert all(p.command_id is None for p in result.points)

    async def test_does_not_update_device_state(
        self, client: AsyncClient, device: CoreDevice
    ):
        """History push must not change the device's in-memory attribute values."""
        assert device.attributes[TEMPERATURE].current_value == INITIAL_TEMPERATURE
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
        assert device.attributes[TEMPERATURE].current_value == INITIAL_TEMPERATURE


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

        result = await ts_service.fetch_points(
            SeriesKey(owner_id=DEVICE_ID, metric=TEMPERATURE)
        )
        assert len(result.points) == 2
        assert {p.value for p in result.points} == {18.5, 19.0}

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
