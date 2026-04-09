from unittest.mock import AsyncMock, MagicMock

import pytest
from devices_manager import DevicesManagerInterface
from devices_manager.dto import Transport, build_transport
from devices_manager.types import TransportProtocols
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from models.errors import NotFoundError
from pydantic import ValidationError

from api.dependencies import get_current_token_payload, get_device_manager
from api.exception_handlers import register_exception_handlers
from api.routes.transports_router import router

_HTTP = build_transport("my-http", "My Http client", TransportProtocols.HTTP, {})
_MQTT = build_transport(
    "my-mqtt",
    "My mqtt broker",
    TransportProtocols.MQTT,
    {"host": "localhost"},
)
_TRANSPORTS_BY_ID: dict[str, Transport] = {_HTTP.id: _HTTP, _MQTT.id: _MQTT}


def _get_transport(transport_id: str) -> Transport:
    if transport_id not in _TRANSPORTS_BY_ID:
        raise NotFoundError(f"Transport {transport_id} not found")
    return _TRANSPORTS_BY_ID[transport_id]


@pytest.fixture
def dm() -> MagicMock:
    mock = MagicMock(spec=DevicesManagerInterface)
    mock.list_transports.return_value = list(_TRANSPORTS_BY_ID.values())
    mock.get_transport.side_effect = _get_transport
    mock.add_transport = AsyncMock(
        side_effect=lambda payload: build_transport(
            "new-id", payload.name, payload.protocol, payload.config
        )
    )
    mock.update_transport = AsyncMock(
        side_effect=lambda tid, update: _get_transport(tid)
    )
    mock.delete_transport = AsyncMock()
    return mock


@pytest.fixture
def app(dm, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
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


def _assert_valid_transport(transport: dict) -> None:
    for key in ("id", "name", "protocol", "config"):
        assert key in transport


class TestListTransports:
    def test_returns_all(self, client: TestClient):
        response = client.get("/")
        assert response.status_code == 200
        transports = response.json()
        assert len(transports) == 2
        for t in transports:
            _assert_valid_transport(t)


class TestGetTransport:
    @pytest.mark.parametrize("transport_id", ["my-http", "my-mqtt"])
    def test_ok(self, client: TestClient, transport_id: str):
        response = client.get(f"/{transport_id}")
        assert response.status_code == 200
        _assert_valid_transport(response.json())

    def test_not_found(self, client: TestClient):
        response = client.get("/unknown")
        assert response.status_code == 404


class TestCreateTransport:
    def test_ok_returns_201(self, client: TestClient):
        payload = {"name": "New HTTP", "protocol": "http", "config": {}}
        response = client.post("/", json=payload)
        assert response.status_code == 201
        _assert_valid_transport(response.json())

    def test_unsupported_protocol_returns_422(self, client: TestClient):
        payload = {"name": "Bad", "protocol": "unknown", "config": {}}
        response = client.post("/", json=payload)
        assert response.status_code == 422


class TestUpdateTransport:
    @pytest.mark.asyncio
    async def test_ok(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.patch("/my-mqtt", json={"name": "renamed"})
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_validation_error_returns_422(
        self, async_client: AsyncClient, dm: MagicMock
    ):
        dm.update_transport.side_effect = ValidationError.from_exception_data(
            "TransportUpdate", []
        )
        async with async_client as ac:
            response = await ac.patch("/my-mqtt", json={"config": {"port": "abc"}})
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_not_found(self, async_client: AsyncClient, dm: MagicMock):
        dm.update_transport.side_effect = NotFoundError("not found")
        async with async_client as ac:
            response = await ac.patch("/unknown", json={"name": "x"})
        assert response.status_code == 404


class TestDeleteTransport:
    @pytest.mark.asyncio
    async def test_ok_returns_204(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.delete("/my-http")
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_not_found(self, async_client: AsyncClient, dm: MagicMock):
        dm.delete_transport.side_effect = NotFoundError("not found")
        async with async_client as ac:
            response = await ac.delete("/unknown")
        assert response.status_code == 404


class TestGetTransportSchemas:
    def test_returns_schemas(self, client: TestClient):
        response = client.get("/schemas/")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == len(TransportProtocols)
        assert data["mqtt"]["properties"]["port"]["type"] == "integer"
