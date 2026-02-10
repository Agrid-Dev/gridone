from unittest.mock import MagicMock

import pytest
from devices_manager.core.devices_manager import DevicesManager
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from api.dependencies import get_device_manager
from api.routes.discovery_router import get_transport_id, router


@pytest.fixture
def devices_manager(mock_transports, mock_drivers) -> DevicesManager:
    return DevicesManager(devices={}, drivers=mock_drivers, transports=mock_transports)


@pytest.fixture
def app(devices_manager: DevicesManager) -> FastAPI:
    app = FastAPI()
    app.include_router(router)

    app.dependency_overrides[get_device_manager] = lambda: devices_manager

    return app


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def async_client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestListDiscoveries:
    def test_list_discoveries_transport_not_found(
        self, client: TestClient, app: FastAPI
    ):
        app.dependency_overrides[get_transport_id] = lambda: "unknown-transport"
        response = client.get("/")
        assert response.status_code == 404

    def test_list_discoveries_disabled(self, client: TestClient, app: FastAPI):
        app.dependency_overrides[get_transport_id] = lambda: "my-mqtt"
        response = client.get("/")
        assert response.status_code == 200
        result = response.json()
        assert len(result) == 1
        assert not result[0]["enabled"]

    def test_list_discoveries_enabled(
        self, devices_manager: DevicesManager, client: TestClient, app: FastAPI
    ):
        app.dependency_overrides[get_transport_id] = lambda: "my-mqtt"
        dm_list = [
            {"driver_id": "test_push_driver", "transport_id": "my-mqtt"},
        ]

        devices_manager.discovery_manager.list = MagicMock(return_value=dm_list)  # type: ignore[invalid-assignment]
        devices_manager.discovery_manager.has = MagicMock(return_value=True)  # type: ignore[invalid-assignment]
        response = client.get("/")
        assert response.status_code == 200
        result = response.json()
        assert result[0]["enabled"]


class TestCreateDiscovery:
    @pytest.mark.asyncio
    async def test_create_fails_driver_not_found(
        self, async_client: AsyncClient, devices_manager: DevicesManager, app: FastAPI
    ):
        app.dependency_overrides[get_transport_id] = lambda: "my-mqtt"
        response = await async_client.post("/", json={"driver_id": "unknown"})
        assert response.status_code == 404
        assert len(devices_manager.discovery_manager.list()) == 0

    @pytest.mark.asyncio
    async def test_create_fails_transport_not_found(
        self, async_client: AsyncClient, devices_manager: DevicesManager, app: FastAPI
    ):
        app.dependency_overrides[get_transport_id] = lambda: "unknown"
        response = await async_client.post("/", json={"driver_id": "test_push_driver"})
        assert response.status_code == 404
        assert len(devices_manager.discovery_manager.list()) == 0

    @pytest.mark.asyncio
    async def test_create_fails_not_a_push_transport(
        self, async_client: AsyncClient, devices_manager: DevicesManager, app: FastAPI
    ):
        app.dependency_overrides[get_transport_id] = lambda: "my-http"
        response = await async_client.post("/", json={"driver_id": "test_push_driver"})
        assert response.status_code == 422
        assert len(devices_manager.discovery_manager.list()) == 0

    @pytest.mark.asyncio
    async def test_create_fails_driver_does_not_support_discovery(
        self, async_client: AsyncClient, devices_manager: DevicesManager, app: FastAPI
    ):
        app.dependency_overrides[get_transport_id] = lambda: "my-mqtt"
        response = await async_client.post("/", json={"driver_id": "test_driver"})
        assert response.status_code == 422
        assert len(devices_manager.discovery_manager.list()) == 0

    @pytest.mark.asyncio
    async def test_create_success(
        self, async_client: AsyncClient, devices_manager: DevicesManager, app: FastAPI
    ):
        transport_id = "my-mqtt"
        driver_id = "test_push_driver"
        app.dependency_overrides[get_transport_id] = lambda: transport_id

        async def mock_register_discovery(driver_id, transport_id):
            return {"driver_id": driver_id, "transport_id": transport_id}

        devices_manager.discovery_manager.register = MagicMock(  # ty: ignore[invalid-assignment]
            side_effect=mock_register_discovery
        )
        response = await async_client.post("/", json={"driver_id": driver_id})
        devices_manager.discovery_manager.register.assert_called_with(  # ty: ignore[unresolved-attribute]
            driver_id=driver_id, transport_id=transport_id
        )
        assert response.status_code == 201


class TestDeleteDiscovery:
    @pytest.mark.asyncio
    async def test_delete_driver_not_found(
        self, async_client: AsyncClient, app: FastAPI
    ):
        transport_id = "my-transport"
        driver_id = "my-driver"
        app.dependency_overrides[get_transport_id] = lambda: transport_id
        response = await async_client.delete(f"/{driver_id}")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_driver_success(
        self, async_client: AsyncClient, devices_manager: DevicesManager, app: FastAPI
    ):
        transport_id = "my-transport"
        driver_id = "my-driver"
        app.dependency_overrides[get_transport_id] = lambda: transport_id

        async def mock_unregister_discovery(driver_id, transport_id):
            return None

        devices_manager.discovery_manager.unregister = MagicMock(  # ty: ignore[invalid-assignment]
            side_effect=mock_unregister_discovery
        )
        response = await async_client.delete(f"/{driver_id}")
        assert response.status_code == 204
        devices_manager.discovery_manager.unregister.assert_called_with(  # ty: ignore[unresolved-attribute]
            driver_id=driver_id, transport_id=transport_id
        )
