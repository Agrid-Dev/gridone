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
)
from api.exception_handlers import register_exception_handlers
from api.routes.devices_router import router
from devices_manager import DevicesService, Driver
from devices_manager.core.driver import DriverMetadata, UpdateStrategy
from devices_manager.core.transports import TransportMetadata
from devices_manager.core.transports.http_transport import (
    HTTPTransportClient,
    HttpTransportConfig,
)
from devices_manager.types import TransportProtocols

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

pytestmark = pytest.mark.asyncio


@pytest.fixture
def driver() -> Driver:
    return Driver(
        metadata=DriverMetadata(id="batch_integration_driver"),
        env={},
        transport=TransportProtocols.HTTP,
        device_config_required=[],
        update_strategy=UpdateStrategy(polling_enabled=False),
        attributes={},
    )


@pytest.fixture
def transport() -> HTTPTransportClient:
    return HTTPTransportClient(
        TransportMetadata(id="http-batch-int", name="Batch Integration HTTP"),
        HttpTransportConfig(),
    )


@pytest_asyncio.fixture
async def integration_app(
    driver: Driver,
    transport: HTTPTransportClient,
    admin_token_payload,
) -> AsyncIterator[FastAPI]:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    dm = DevicesService(
        drivers={driver.id: driver},
        transports={transport.id: transport},
    )
    await dm.start()
    app.dependency_overrides[get_device_manager] = lambda: dm
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


class TestBatchCreateLifecycle:
    """A batch-created device must behave identically to one created via

    POST /devices/ afterward: gettable, updatable, deletable.
    """

    async def test_batch_created_device_is_updatable_and_deletable(
        self, client: AsyncClient, driver: Driver, transport: HTTPTransportClient
    ):
        async with client as ac:
            create_response = await ac.post(
                "/batch",
                json={
                    "driver_id": driver.id,
                    "transport_id": transport.id,
                    "devices": [
                        {"name": "Sensor A", "config": {"unit_id": "a"}},
                        {"name": "Sensor B", "config": {"unit_id": "b"}},
                    ],
                },
            )
            assert create_response.status_code == 201
            results = create_response.json()
            assert len(results) == 2
            device_a_id = results[0]["device"]["id"]
            device_b_id = results[1]["device"]["id"]

            get_response = await ac.get(f"/{device_a_id}")
            assert get_response.status_code == 200
            assert get_response.json()["name"] == "Sensor A"

            update_response = await ac.patch(
                f"/{device_a_id}", json={"name": "Renamed Sensor A"}
            )
            assert update_response.status_code == 200
            assert update_response.json()["name"] == "Renamed Sensor A"

            delete_response = await ac.delete(f"/{device_a_id}")
            assert delete_response.status_code == 204

            get_deleted_response = await ac.get(f"/{device_a_id}")
            assert get_deleted_response.status_code == 404

            # The other batch-created device is unaffected by A's update/delete.
            get_b_response = await ac.get(f"/{device_b_id}")
            assert get_b_response.status_code == 200
            assert get_b_response.json()["name"] == "Sensor B"
