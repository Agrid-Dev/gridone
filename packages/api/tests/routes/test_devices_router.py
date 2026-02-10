import pytest
from devices_manager import Device
from devices_manager.core.devices_manager import DevicesManager
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from api.dependencies import get_device_manager, get_repository
from api.routes.devices_router import router


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


@pytest.fixture
def async_client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestCreateDevice:
    @pytest.mark.asyncio
    async def test_create_device_ok(
        self, async_client: AsyncClient, create_payload: dict
    ):
        async with async_client as ac:
            response = await ac.post("/", json=create_payload)
        assert response.status_code == 201
        result = response.json()
        assert "id" in result
        assert len(result["id"]) > 1
        assert result["name"] == create_payload["name"]
        assert result["config"] == create_payload["config"]

    @pytest.mark.asyncio
    async def test_create_device_invalid_transport(
        self, async_client: AsyncClient, create_payload: dict
    ):
        create_payload["transport_id"] = "unknown_transport"
        async with async_client as ac:
            response = await ac.post("/", json=create_payload)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_device_invalid_driver(
        self, async_client: AsyncClient, create_payload: dict
    ):
        create_payload["driver_id"] = "unknown_transport"
        async with async_client as ac:
            response = await ac.post("/", json=create_payload)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_device_missing_config(
        self, async_client: AsyncClient, create_payload: dict
    ):
        del create_payload["config"]["some_id"]  # misses a field required by driver
        async with async_client as ac:
            response = await ac.post("/", json=create_payload)
        assert response.status_code == 422


@pytest.fixture
def device_id(mock_devices) -> str:
    """Returns the first id of mock devices (dm fixtures)."""
    return next(iter(mock_devices.keys()))


class TestUpdateDevice:
    def test_update_device_name(self, client: TestClient, device_id: str):
        new_name = "New name"
        response = client.patch(f"/{device_id}", json={"name": new_name})
        assert response.status_code == 200
        read_response = client.get(f"/{device_id}")
        updated_device = read_response.json()
        assert updated_device["name"] == new_name

    def test_update_device_config_ok(self, client: TestClient, device_id: str):
        new_config = {"some_id": "def"}
        response = client.patch(f"/{device_id}", json={"config": new_config})
        assert response.status_code == 200
        read_response = client.get(f"/{device_id}")
        updated_device = read_response.json()
        assert updated_device["config"] == new_config

    def test_update_device_config_invalid(self, client: TestClient, device_id: str):
        new_config = {"other": 99}
        response = client.patch(f"/{device_id}", json={"config": new_config})
        assert response.status_code == 422

    def test_update_device_driver_not_found(self, client: TestClient, device_id: str):
        response = client.patch(f"/{device_id}", json={"driver_id": "unknown"})
        assert response.status_code == 404

    def test_update_device_transport_not_found(
        self, client: TestClient, device_id: str
    ):
        response = client.patch(f"/{device_id}", json={"transport_id": "unknown"})
        assert response.status_code == 404

    def test_update_device_driver_protocol_mismatch(
        self, client: TestClient, device_id: str
    ):
        response = client.patch(f"/{device_id}", json={"driver_id": "test_push_driver"})
        assert response.status_code == 422

    def test_update_atomic(self, client: TestClient, device_id: str):
        """Update is all or nothing"""
        previous = client.get(f"/{device_id}").json()
        update_response = client.patch(
            f"/{device_id}",
            json={
                "name": "my new name",
                "config": {"some_id": "bcd"},
                "transport_id": "unknown",
            },
        )
        assert update_response.status_code == 404
        current = client.get(f"/{device_id}").json()
        assert current == previous


class TestDeleteDevice:
    def test_delete_device_ok(self, client: TestClient, mock_devices):
        device_ids = list(mock_devices.keys())
        assert len(device_ids) >= 1, "Require at least one device to test deletion"
        for device_id in device_ids:
            response = client.delete(f"/{device_id}")
            assert response.status_code == 204

    def test_delete_device_not_found(self, client: TestClient):
        response = client.delete("/unknown")
        assert response.status_code == 404
