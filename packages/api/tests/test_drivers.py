import pytest
from core.devices_manager import DevicesManager
from core.types import TransportProtocols
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_device_manager, get_repository
from api.routes.drivers import router


@pytest.fixture
def app(mock_repository, mock_drivers) -> FastAPI:
    app = FastAPI()
    app.include_router(router)

    def get_mock_devices_manager() -> DevicesManager:
        return DevicesManager(devices={}, drivers=mock_drivers, transports={})

    app.dependency_overrides[get_device_manager] = get_mock_devices_manager
    app.dependency_overrides[get_repository] = lambda: mock_repository
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


class TestListDrivers:
    def test_list_drivers(self, client: TestClient):
        response = client.get("/")
        assert response.status_code == 200
        drivers = response.json()
        assert len(drivers) == 1


class TestGetDriver:
    def test_get_driver_by_id_ok(self, client: TestClient):
        driver_id = "test_driver"
        response = client.get(f"/{driver_id}")
        assert response.status_code == 200
        driver = response.json()
        assert driver["id"] == driver_id
        assert driver["transport"] == TransportProtocols.HTTP

    def test_get_driver_not_found(self, client: TestClient):
        driver_id = "unknown"
        response = client.get(f"/{driver_id}")
        assert response.status_code == 404
