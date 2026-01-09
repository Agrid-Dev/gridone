import pytest
from core.devices_manager import DevicesManager
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.get_device_manager import get_device_manager
from api.routes.transports import router


@pytest.fixture
def client(mock_transports) -> TestClient:
    app = FastAPI()
    app.include_router(router)

    def get_mock_devices_manager() -> DevicesManager:
        return DevicesManager(devices={}, drivers={}, transports=mock_transports)

    app.dependency_overrides[get_device_manager] = get_mock_devices_manager

    return TestClient(app)


def assert_valid_transport(transport: dict) -> None:
    assert transport["id"]
    assert transport["name"]
    assert transport["protocol"]
    assert transport["config"]


def test_list_clients(client):
    response = client.get("/")
    assert response.status_code == 200
    transports = response.json()
    assert len(transports) == 2
    for transport in transports:
        assert_valid_transport(transport)


@pytest.mark.parametrize(("transport_id"), [("my-http"), ("my-mqtt")])
def test_get_transport(client, transport_id):
    response = client.get(f"/{transport_id}")
    assert response.status_code == 200
    transport = response.json()
    assert_valid_transport(transport)


def test_get_transport_not_found(client):
    response = client.get("/unknown")
    assert response.status_code == 404
