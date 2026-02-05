import pytest
from core.devices_manager import DevicesManager
from core.types import TransportProtocols
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from api.dependencies import get_device_manager, get_repository
from api.routes.transports_router import router


@pytest.fixture
def app(mock_transports, mock_repository) -> FastAPI:
    app = FastAPI()
    app.include_router(router)

    def get_mock_devices_manager() -> DevicesManager:
        return DevicesManager(devices={}, drivers={}, transports=mock_transports)

    app.dependency_overrides[get_device_manager] = get_mock_devices_manager
    app.dependency_overrides[get_repository] = lambda: mock_repository
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


def assert_valid_transport(transport: dict) -> None:
    for key in ("id", "name", "protocol", "config"):
        assert key in transport, f"Missing key '{key}' in transport: {transport}"
    assert isinstance(transport["id"], str)
    assert isinstance(transport["name"], str)
    assert isinstance(transport["protocol"], str)
    assert isinstance(transport["config"], dict), "config should be a JSON object"


class TestListTransports:
    def test_list_clients(self, client: TestClient):
        response = client.get("/")
        assert response.status_code == 200

        transports = response.json()
        assert len(transports) == 2
        for transport in transports:
            assert_valid_transport(transport)


class TestGetTransport:
    @pytest.mark.parametrize("transport_id", ["my-http", "my-mqtt"])
    def test_get_transport_ok(self, client: TestClient, transport_id: str):
        response = client.get(f"/{transport_id}")
        assert response.status_code == 200
        transport = response.json()
        assert_valid_transport(transport)

    def test_get_transport_not_found(self, client: TestClient):
        response = client.get("/unknown")
        assert response.status_code == 404


class TestCreateTransport:
    def _valid_payload(self, protocol: str) -> dict:
        # Very small factory to avoid repeating payloads
        if protocol == "http":
            return {
                "name": "My HTTP",
                "protocol": "http",
                "config": {},
            }
        if protocol == "mqtt":
            return {
                "name": "My MQTT",
                "protocol": "mqtt",
                "config": {
                    "host": "localhost",
                    "port": 1883,
                },
            }
        msg = f"Unknown test protocol: {protocol}"
        raise ValueError(msg)

    @pytest.mark.parametrize(
        "protocol",
        [
            "http"
            # , "mqtt"
        ],
    )
    def test_create_transport_ok(self, client: TestClient, protocol: str):
        payload = self._valid_payload(protocol)
        response = client.post("/", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert_valid_transport(data)
        assert data["protocol"] == protocol

    def test_create_transport_invalid_config(self, client: TestClient):
        payload = {
            "name": "Invalid",
            "protocol": "mqtt",
            "config": {"something": "wrong"},
        }
        response = client.post("/", json=payload)
        assert response.status_code == 422

    def test_create_transport_unsupported_protocol(self, client: TestClient):
        payload = {
            "name": "Bad",
            "protocol": "unknown",
            "config": {},
        }
        response = client.post("/", json=payload)
        assert response.status_code in (400, 422)

    def test_create_transport_persistence(self, client: TestClient):
        payload = {
            "name": "My HTTP",
            "protocol": "http",
            "config": {},
        }
        write_response = client.post("/", json=payload).json()
        transport_id = write_response["id"]
        read_response = client.get(f"/{transport_id}")
        assert read_response.status_code == 200


@pytest.fixture
def async_client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestUpdateTransport:
    @pytest.mark.asyncio
    async def test_update_name_ok(self, async_client):
        transport_id = "my-mqtt"
        name = "youkoun"
        async with async_client as ac:
            response = await ac.patch(f"/{transport_id}", json={"name": name})
        assert response.status_code == 200
        response_data = response.json()
        assert response_data["id"] == transport_id
        assert response_data["name"] == name

    @pytest.mark.asyncio
    async def test_update_config_ok(self, async_client):
        transport_id = "my-mqtt"
        port = 1884
        async with async_client as ac:
            response = await ac.patch(
                f"/{transport_id}", json={"config": {"port": port}}
            )
        assert response.status_code == 200
        response_data = response.json()
        assert response_data["id"] == transport_id
        assert response_data["config"]["port"] == port

    @pytest.mark.asyncio
    async def test_update_config_invalid(self, async_client):
        transport_id = "my-mqtt"
        async with async_client as ac:
            response = await ac.patch(
                f"/{transport_id}", json={"config": {"port": "abc"}}
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_persistence(self, async_client):
        transport_id = "my-mqtt"
        port = 1884
        async with async_client as ac:
            update_response = await ac.patch(
                f"/{transport_id}", json={"config": {"port": port}}
            )
            assert update_response.status_code == 200
            read_response = await ac.get(f"/{transport_id}")
        updated = read_response.json()
        assert updated["config"]["port"] == port


class TestDeleteTransport:
    @pytest.mark.asyncio
    async def test_delete_transport_ok(self, async_client):
        transport_id = "my-mqtt"
        async with async_client as ac:
            delete_response = await ac.delete(f"/{transport_id}")
            assert delete_response.status_code == 204
            get_response = await ac.get(f"/{transport_id}")
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_transport_unknown(self, async_client):
        transport_id = "unknown"
        async with async_client as ac:
            response = await ac.delete(f"/{transport_id}")
        assert response.status_code == 404

    @pytest.mark.skip
    @pytest.mark.asyncio
    async def test_delete_transport_in_use(self, async_client):
        """@TODO : test conflict when deleting transport used by device"""


class TestGetTransportSchemas:
    def test_get_transport_schemas(self, client):
        response = client.get("/schemas/")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == len(TransportProtocols)
        assert data["mqtt"]["properties"]["port"]["type"] == "integer"
