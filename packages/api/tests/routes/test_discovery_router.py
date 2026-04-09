from unittest.mock import AsyncMock, MagicMock

import pytest
from devices_manager import DevicesManagerInterface, DiscoveryManagerInterface
from devices_manager.dto import DriverSpec, build_transport
from devices_manager.types import TransportProtocols
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from models.errors import NotFoundError

from api.dependencies import get_current_token_payload, get_device_manager
from api.routes.discovery_router import get_transport_id, router

_MQTT_DRIVER = DriverSpec.model_validate(
    {
        "id": "test_push_driver",
        "transport": "mqtt",
        "env": {},
        "device_config": [{"name": "some_id"}],
        "attributes": [],
        "discovery": {
            "topic": "thermocktat/#",
            "field_getters": [
                {"name": "device_id", "adapters": [{"json_pointer": "/device_id"}]}
            ],
        },
    }
)

_MQTT_TRANSPORT = build_transport(
    "my-mqtt", "My mqtt", TransportProtocols.MQTT, {"host": "localhost"}
)


@pytest.fixture
def discovery() -> MagicMock:
    mock = MagicMock(spec=DiscoveryManagerInterface)
    mock.has.return_value = False
    mock.register = AsyncMock()
    mock.unregister = AsyncMock()
    mock.list.return_value = []
    return mock


@pytest.fixture
def dm(discovery) -> MagicMock:
    mock = MagicMock(spec=DevicesManagerInterface)
    mock.transport_ids = {"my-mqtt"}
    mock.driver_ids = {"test_push_driver"}
    mock.list_drivers.return_value = [_MQTT_DRIVER]

    def _get_transport(tid: str):
        if tid == "my-mqtt":
            return _MQTT_TRANSPORT
        raise NotFoundError(f"Transport {tid} not found")

    mock.get_transport.side_effect = _get_transport
    mock.discovery_manager = discovery
    return mock


@pytest.fixture
def app(dm, admin_token_payload) -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def async_client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestListDiscoveries:
    def test_transport_not_found(self, client: TestClient, app: FastAPI):
        app.dependency_overrides[get_transport_id] = lambda: "unknown-transport"
        response = client.get("/")
        assert response.status_code == 404

    def test_disabled(self, client: TestClient, app: FastAPI):
        app.dependency_overrides[get_transport_id] = lambda: "my-mqtt"
        response = client.get("/")
        assert response.status_code == 200
        result = response.json()
        assert len(result) == 1
        assert not result[0]["enabled"]

    def test_enabled(self, client: TestClient, app: FastAPI, discovery: MagicMock):
        app.dependency_overrides[get_transport_id] = lambda: "my-mqtt"
        discovery.has.return_value = True
        response = client.get("/")
        assert response.status_code == 200
        assert response.json()[0]["enabled"]


class TestCreateDiscovery:
    @pytest.mark.asyncio
    async def test_driver_not_found(self, async_client: AsyncClient, app: FastAPI, dm):
        dm.driver_ids = set()
        app.dependency_overrides[get_transport_id] = lambda: "my-mqtt"
        response = await async_client.post("/", json={"driver_id": "unknown"})
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_transport_not_found(self, async_client: AsyncClient, app: FastAPI):
        app.dependency_overrides[get_transport_id] = lambda: "unknown"
        response = await async_client.post("/", json={"driver_id": "test_push_driver"})
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_type_error_returns_422(
        self, async_client: AsyncClient, app: FastAPI, discovery: MagicMock
    ):
        app.dependency_overrides[get_transport_id] = lambda: "my-mqtt"
        discovery.register.side_effect = TypeError("not a push transport")
        response = await async_client.post("/", json={"driver_id": "test_push_driver"})
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_success_returns_201(
        self, async_client: AsyncClient, app: FastAPI, discovery: MagicMock
    ):
        app.dependency_overrides[get_transport_id] = lambda: "my-mqtt"
        response = await async_client.post("/", json={"driver_id": "test_push_driver"})
        assert response.status_code == 201
        discovery.register.assert_called_once_with(
            driver_id="test_push_driver", transport_id="my-mqtt"
        )


class TestDeleteDiscovery:
    @pytest.mark.asyncio
    async def test_not_found(
        self, async_client: AsyncClient, app: FastAPI, discovery: MagicMock
    ):
        app.dependency_overrides[get_transport_id] = lambda: "my-transport"
        discovery.unregister.side_effect = KeyError("not found")
        response = await async_client.delete("/my-driver")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_success_returns_204(
        self, async_client: AsyncClient, app: FastAPI, discovery: MagicMock
    ):
        app.dependency_overrides[get_transport_id] = lambda: "my-transport"
        response = await async_client.delete("/my-driver")
        assert response.status_code == 204
        discovery.unregister.assert_called_once_with(
            driver_id="my-driver", transport_id="my-transport"
        )
