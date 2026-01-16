import pytest
from core import Device
from core.devices_manager import DevicesManager
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_device_manager, get_repository
from api.routes.devices import router


@pytest.fixture
def app(mock_devices, mock_drivers, mock_transports, mock_repository) -> FastAPI:
    app = FastAPI()
    app.include_router(router)

    def get_mock_devices_manager() -> DevicesManager:
        return DevicesManager(
            devices=mock_devices, drivers=mock_drivers, transports=mock_transports
        )

    app.dependency_overrides[get_device_manager] = get_mock_devices_manager
    app.dependency_overrides[get_repository] = lambda: mock_repository
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


class TestListDevices:
    def test_list_devices(self, client: TestClient):
        response = client.get("/")
        assert response.status_code == 200
        devices = response.json()
        assert len(devices) == 1


class TestGetDevice:
    def test_get_device_ok(self, client: TestClient, mock_devices: dict[str, Device]):
        for device_id in mock_devices:
            response = client.get(f"/{device_id}")
            assert response.status_code == 200
            device = response.json()
            assert device["id"] == device_id

    def test_get_device_not_found(self, client: TestClient):
        response = client.get("/unknown")
        assert response.status_code == 404


@pytest.fixture
def create_payload() -> dict:
    return {
        "name": "my new device",
        "config": {"some_id": "abc"},
        "driver_id": "test_driver",  # in dm from fixtures
        "transport_id": "my-http",
    }


class TestCreateDevice:
    def test_create_device_ok(self, client: TestClient, create_payload: dict):
        response = client.post("/", json=create_payload)
        assert response.status_code == 201
        result = response.json()
        assert "id" in result
        assert len(result["id"]) > 1
        assert result["name"] == create_payload["name"]
        assert result["config"] == create_payload["config"]

    def test_create_device_invalid_transport(
        self, client: TestClient, create_payload: dict
    ):
        create_payload["transport_id"] = "unknown_transport"
        response = client.post("/", json=create_payload)
        assert response.status_code == 404

    def test_create_device_invalid_driver(
        self, client: TestClient, create_payload: dict
    ):
        create_payload["driver_id"] = "unknown_transport"
        response = client.post("/", json=create_payload)
        assert response.status_code == 404

    def test_create_device_missing_config(
        self, client: TestClient, create_payload: dict
    ):
        del create_payload["config"]["some_id"]  # misses a field required by driver
        response = client.post("/", json=create_payload)
        assert response.status_code == 422
