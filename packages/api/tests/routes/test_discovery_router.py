from unittest.mock import MagicMock

import pytest
from core.devices_manager import DevicesManager
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
    def test_list_discoveries_empty(self, client: TestClient, app: FastAPI):
        app.dependency_overrides[get_transport_id] = lambda: "my-transport"
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_discoveries(
        self, devices_manager: DevicesManager, client: TestClient, app: FastAPI
    ):
        app.dependency_overrides[get_transport_id] = lambda: "transport_1"
        dm_list = [
            {"driver_id": "driver_1", "transport_id": "transport_1"},
            {"driver_id": "driver_2", "transport_id": "transport_1"},
        ]

        devices_manager.list_discoveries = MagicMock(return_value=dm_list)  # type: ignore[invalid-assignment]
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == dm_list

    def test_list_discoveries_only_include_current_transport(
        self, devices_manager: DevicesManager, client: TestClient, app: FastAPI
    ):
        transport_id = "transport_1"
        app.dependency_overrides[get_transport_id] = lambda: transport_id
        dm_list = [
            {"driver_id": "driver_1", "transport_id": transport_id},
            {"driver_id": "driver_2", "transport_id": transport_id},
            {"driver_id": "driver_1", "transport_id": "other"},
            {"driver_id": "driver_2", "transport_id": "other"},
        ]

        spy = MagicMock(return_value=dm_list)
        devices_manager.list_discoveries = spy  # type: ignore[invalid-assignment]
        response = client.get("/")
        spy.assert_called_with(transport_id=transport_id)

        assert response.status_code == 200


class TestCreateDiscovery:
    @pytest.mark.asyncio
    async def test_create_fails_driver_not_found(
        self, async_client: AsyncClient, devices_manager: DevicesManager, app: FastAPI
    ):
        app.dependency_overrides[get_transport_id] = lambda: "my-mqtt"
        response = await async_client.post("/", json={"driver_id": "unknown"})
        assert response.status_code == 404
        assert len(devices_manager.list_discoveries()) == 0

    @pytest.mark.asyncio
    async def test_create_fails_transport_not_found(
        self, async_client: AsyncClient, devices_manager: DevicesManager, app: FastAPI
    ):
        app.dependency_overrides[get_transport_id] = lambda: "unknown"
        response = await async_client.post("/", json={"driver_id": "test_push_driver"})
        assert response.status_code == 404
        assert len(devices_manager.list_discoveries()) == 0

    @pytest.mark.asyncio
    async def test_create_fails_not_a_push_transport(
        self, async_client: AsyncClient, devices_manager: DevicesManager, app: FastAPI
    ):
        app.dependency_overrides[get_transport_id] = lambda: "my-http"
        response = await async_client.post("/", json={"driver_id": "test_push_driver"})
        assert response.status_code == 422
        assert len(devices_manager.list_discoveries()) == 0

    @pytest.mark.asyncio
    async def test_create_fails_driver_does_not_support_discovery(
        self, async_client: AsyncClient, devices_manager: DevicesManager, app: FastAPI
    ):
        app.dependency_overrides[get_transport_id] = lambda: "my-mqtt"
        response = await async_client.post("/", json={"driver_id": "test_driver"})
        assert response.status_code == 422
        assert len(devices_manager.list_discoveries()) == 0

    @pytest.mark.asyncio
    async def test_create_success(
        self, async_client: AsyncClient, devices_manager: DevicesManager, app: FastAPI
    ):
        transport_id = "my-mqtt"
        driver_id = "test_push_driver"
        app.dependency_overrides[get_transport_id] = lambda: transport_id

        async def mock_register_discovery(driver_id, transport_id):
            return {"driver_id": driver_id, "transport_id": transport_id}

        devices_manager.register_discovery = MagicMock(  # ty: ignore[invalid-assignment]
            side_effect=mock_register_discovery
        )
        response = await async_client.post("/", json={"driver_id": driver_id})
        devices_manager.register_discovery.assert_called_with(  # ty: ignore[unresolved-attribute]
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

        devices_manager.unregister_discovery = MagicMock(  # ty: ignore[invalid-assignment]
            side_effect=mock_unregister_discovery
        )
        response = await async_client.delete(f"/{driver_id}")
        assert response.status_code == 204
        devices_manager.unregister_discovery.assert_called_with(  # ty: ignore[unresolved-attribute]
            driver_id=driver_id, transport_id=transport_id
        )
