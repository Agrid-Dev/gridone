import pytest
from core.devices_manager import DevicesManager
from core.types import TransportProtocols
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_device_manager, get_repository
from api.routes.drivers_router import router


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
        assert len(drivers) == 2


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


@pytest.fixture
def valid_create_payload() -> dict:
    return {
        "id": "thermocktat_mqtt",
        "transport": "mqtt",
        "device_config": [{"name": "device_id"}],
        "attributes": [
            {
                "name": "temperature",
                "data_type": "float",
                "read": {
                    "topic": "thermocktat/${device_id}/snapshot",
                    "request": {
                        "topic": "thermocktat/${device_id}/get/snapshot",
                        "message": {"input": "hello"},
                    },
                },
                "json_pointer": "/ambient_temperature",
            },
            {
                "name": "temperature_setpoint",
                "data_type": "float",
                "read": {
                    "topic": "thermocktat/${device_id}/snapshot",
                    "request": {
                        "topic": "thermocktat/${device_id}/get/snapshot",
                        "message": {"input": "hello"},
                    },
                },
                "write": {
                    "topic": "thermocktat/${device_id}/set/temperature_setpoint",
                    "request": {
                        "topic": "thermocktat/${device_id}/set/temperature_setpoint",
                        "message": {"value": "${value}"},
                    },
                },
                "json_pointer": "/temperature_setpoint",
            },
        ],
    }


class TestCreateDriver:
    def test_create_ok(self, client: TestClient, valid_create_payload: dict):
        response = client.post("/", json=valid_create_payload)
        assert response.status_code == 201

    def test_create_persists(self, client: TestClient, valid_create_payload: dict):
        driver_id = valid_create_payload["id"]
        pre_create_get_response = client.get(f"/{driver_id}")
        assert pre_create_get_response.status_code == 404
        response = client.post("/", json=valid_create_payload)
        assert response.status_code == 201
        post_create_get_response = client.get(f"/{driver_id}")
        assert post_create_get_response.status_code == 200
        assert post_create_get_response.json()["id"] == driver_id

    def test_rejects_if_exists(self, client: TestClient, valid_create_payload: dict):
        payload = valid_create_payload.copy()
        payload["id"] = "test_driver"  # initial seed from conftest
        response = client.post("/", json=payload)
        assert response.status_code == 409

    def test_rejects_if_invalid(self, client: TestClient, valid_create_payload: dict):
        payload = valid_create_payload.copy()
        del payload["transport"]
        response = client.post("/", json=payload)
        assert response.status_code == 422

    def test_create_from_yaml_payload(self, client: TestClient, yaml_driver: str):
        response = client.post("/", json={"yaml": yaml_driver})
        assert response.status_code == 201


class TestDeleteDriver:
    def test_delete_ok(self, client: TestClient):
        driver_id = "test_driver"
        response = client.delete(f"/{driver_id}")
        assert response.status_code == 204

    def test_delete_not_found(self, client: TestClient):
        driver_id = "unknown"
        response = client.delete(f"/{driver_id}")
        assert response.status_code == 404

    @pytest.mark.skip
    def test_delete_used_by_device(self, client: TestClient):
        """@TODO: test conflict is driver used by a device"""
        pass
