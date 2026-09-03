import asyncio
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio

from api.attribute_listeners import register_attribute_listeners
from devices_manager import CoreDevice, DeviceBase, DevicesService, Driver
from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.driver import AttributeDriver, DriverMetadata, UpdateStrategy
from devices_manager.core.transports import TransportMetadata
from devices_manager.core.transports.http_transport import (
    HTTPTransportClient,
    HttpTransportConfig,
)
from devices_manager.types import DataType, TransportProtocols
from models.types import AttributeValueType
from timeseries.domain import SeriesKey
from timeseries.service import TimeSeriesService

pytestmark = pytest.mark.asyncio

DEVICE_ID = "dev-listeners"
TEMPERATURE = "temperature"
INITIAL_TEMPERATURE = 20.0


@pytest.fixture
def driver() -> Driver:
    return Driver(
        metadata=DriverMetadata(id="listeners_driver"),
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
        },
    )


@pytest.fixture
def transport() -> HTTPTransportClient:
    return HTTPTransportClient(
        TransportMetadata(id="http-listeners", name="Listeners HTTP"),
        HttpTransportConfig(),
    )


@pytest.fixture
def device(driver: Driver, transport: HTTPTransportClient) -> CoreDevice:
    return CoreDevice.from_base(
        DeviceBase(id=DEVICE_ID, name="Listeners Sensor", config={}),
        driver=driver,
        transport=transport,
        initial_values={TEMPERATURE: INITIAL_TEMPERATURE},
    )


@pytest_asyncio.fixture
async def ts_service():
    service = TimeSeriesService(storage_url=None)
    await service.start()
    yield service
    await service.stop()


@pytest_asyncio.fixture
async def devices_service(
    device: CoreDevice, driver: Driver, transport: HTTPTransportClient
):
    service = DevicesService(
        drivers={driver.id: driver},
        transports={transport.id: transport},
        devices={device.id: device},
    )
    await service.start()
    yield service
    await service.stop()


async def _poll_points(
    ts_service: TimeSeriesService, key: SeriesKey, *, max_wait: float = 2.0
) -> list[AttributeValueType]:
    """Poll until the background persist listener's write lands, or time out."""
    deadline = asyncio.get_event_loop().time() + max_wait
    while True:
        result = await ts_service.fetch_points(key)
        if result.points or asyncio.get_event_loop().time() >= deadline:
            return [p.value for p in result.points]
        await asyncio.sleep(0.01)


class TestBroadcastPersistIsolation:
    async def test_broadcast_failure_does_not_prevent_point_from_being_written(
        self,
        devices_service: DevicesService,
        ts_service: TimeSeriesService,
        device: CoreDevice,
    ):
        """A raising broadcast listener must not block persistence.

        Registers listeners via `register_attribute_listeners` — the same
        function `app.py`'s lifespan calls — against a real `DevicesService`
        (as opposed to test_attribute_listeners.py, which calls the listener
        coroutines directly) to prove that registering the two concerns as
        separate listeners — rather than one coroutine awaiting both in
        sequence — gives each its own background task, so a failure in one
        cannot prevent the other from running.
        """
        websocket_manager = AsyncMock()
        websocket_manager.broadcast.side_effect = RuntimeError("boom")

        register_attribute_listeners(devices_service, websocket_manager, ts_service)

        attr = device.attributes[TEMPERATURE]
        device._update_attribute(attr, 30.0)  # noqa: SLF001

        points = await _poll_points(
            ts_service, SeriesKey(owner_id=DEVICE_ID, metric=TEMPERATURE)
        )
        assert points == [30.0]
