from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from api.dependencies import get_current_token_payload, get_device_manager
from api.exception_handlers import register_exception_handlers
from api.routes.transports_router import (
    MAX_INGRESS_BODY_BYTES,
    ingress_router,
    router,
)
from devices_manager import DevicesServiceInterface, IngressRequest, IngressResult
from devices_manager.dto import (
    TRANSPORT_CONFIG_CLASS_BY_PROTOCOL,
    Transport,
    build_transport,
)
from devices_manager.types import TransportProtocols
from models.errors import InvalidError, NotFoundError, UnauthorizedError

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
        msg = f"Transport {transport_id} not found"
        raise NotFoundError(msg)
    return _TRANSPORTS_BY_ID[transport_id]


@pytest.fixture
def dm() -> MagicMock:
    mock = MagicMock(spec=DevicesServiceInterface)
    mock.list_transports.return_value = list(_TRANSPORTS_BY_ID.values())
    mock.get_transport.side_effect = _get_transport
    mock.add_transport = AsyncMock(
        side_effect=lambda payload: build_transport(
            "new-id", payload.name, payload.protocol, payload.config
        )
    )
    mock.update_transport = AsyncMock(
        side_effect=lambda tid, _update: _get_transport(tid)
    )
    mock.delete_transport = AsyncMock()
    return mock


@pytest.fixture
def app(dm, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.include_router(ingress_router)
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

    def test_config_not_matching_protocol_returns_422(self, client: TestClient):
        payload = {"name": "PLC", "protocol": "modbus-tcp", "config": {}}
        response = client.post("/", json=payload)
        assert response.status_code == 422

    def test_config_field_error_loc_pins_union_and_config_scopes(
        self, client: TestClient
    ):
        """AGR-921 shape 1: FastAPI owns `body.<tag>.config.<field>`."""
        response = client.post(
            "/",
            json={
                "name": "Broker",
                "protocol": "mqtt",
                "config": {"host": "broker.local", "port": 0},
            },
        )

        assert response.status_code == 422
        assert [item["loc"] for item in response.json()["detail"]] == [
            ["body", "mqtt", "config", "port"]
        ]


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
    async def test_config_field_error_loc_is_relative_to_config_model(
        self, async_client: AsyncClient, dm: MagicMock
    ):
        """AGR-921 shape 2: update-time revalidation starts at the field."""
        config_class = TRANSPORT_CONFIG_CLASS_BY_PROTOCOL[TransportProtocols.MQTT]
        with pytest.raises(ValidationError) as exc_info:
            config_class.model_validate({"host": "broker.local", "port": 0})
        dm.update_transport.side_effect = exc_info.value

        async with async_client as ac:
            response = await ac.patch(
                "/my-mqtt", json={"config": {"host": "broker.local", "port": 0}}
            )

        assert response.status_code == 422
        assert [item["loc"] for item in response.json()["detail"]] == [["port"]]
        # Sanitized contract: no pydantic `input`/`ctx`/`url` internals leak
        # (`input` would echo submitted secrets back to the client).
        assert all(
            set(item.keys()) == {"loc", "msg", "type"}
            for item in response.json()["detail"]
        )

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("protocol", "config", "expected_msg"),
        [
            pytest.param(
                TransportProtocols.KNX,
                {"gateway_ip": "10.0.0.1", "secure_user_password": "pw"},
                "secure_device_authentication_password and secure_user_password "
                "must be set together to enable KNX IP-Secure",
                id="knx-lone-secure-password",
            ),
            pytest.param(
                TransportProtocols.MQTT,
                {"host": "broker.local", "client_cert": "cert"},
                "client_cert and client_key must be provided together",
                id="mqtt-cert-without-key",
            ),
            pytest.param(
                TransportProtocols.WEBHOOK,
                {},
                "secret is required unless auth is 'none'",
                id="webhook-auth-without-secret",
            ),
        ],
    )
    async def test_model_validator_error_returns_a_sanitized_422(
        self,
        async_client: AsyncClient,
        dm: MagicMock,
        protocol: TransportProtocols,
        config: dict,
        expected_msg: str,
    ):
        """AGR-921 shape 3 driven by REAL model validators: their `ctx` holds a
        raw ValueError, which used to crash the JSON encoder into a 500 —
        the clear pair message never reached the edit form.
        """
        config_class = TRANSPORT_CONFIG_CLASS_BY_PROTOCOL[protocol]
        with pytest.raises(ValidationError) as exc_info:
            config_class.model_validate(config)
        dm.update_transport.side_effect = exc_info.value

        async with async_client as ac:
            response = await ac.patch("/my-mqtt", json={"config": config})

        assert response.status_code == 422
        assert response.json() == {
            "detail": [{"loc": [], "msg": expected_msg, "type": "value_error"}]
        }

    @pytest.mark.asyncio
    async def test_not_found(self, async_client: AsyncClient, dm: MagicMock):
        dm.update_transport.side_effect = NotFoundError("not found")
        async with async_client as ac:
            response = await ac.patch("/unknown", json={"name": "x"})
        assert response.status_code == 404


class TestReconnectTransport:
    @pytest.mark.asyncio
    async def test_ok(self, async_client: AsyncClient, dm: MagicMock):
        dm.reconnect_transport = AsyncMock(side_effect=_get_transport)
        async with async_client as ac:
            response = await ac.post("/my-mqtt/reconnect")
        assert response.status_code == 200
        _assert_valid_transport(response.json())
        dm.reconnect_transport.assert_awaited_once_with("my-mqtt")

    @pytest.mark.asyncio
    async def test_not_found(self, async_client: AsyncClient, dm: MagicMock):
        dm.reconnect_transport = AsyncMock(side_effect=NotFoundError("not found"))
        async with async_client as ac:
            response = await ac.post("/unknown/reconnect")
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


class _FakeIngressTarget:
    """In-memory MessageIngress capturing what the route hands over."""

    def __init__(self, matched: int = 1) -> None:
        self.requests: list[IngressRequest] = []
        self._matched = matched

    async def ingress(self, request: IngressRequest) -> IngressResult:
        self.requests.append(request)
        return IngressResult(matched=self._matched)


class TestIngress:
    def test_ok_forwards_request_to_transport(self, client: TestClient, dm: MagicMock):
        target = _FakeIngressTarget(matched=2)
        dm.get_transport_ingress.return_value = target
        response = client.post(
            "/my-webhook/ingress/room1/snapshot?source=app1",
            content=b'{"temperature": 21.5}',
            headers={"X-Custom": "Value", "Authorization": "Bearer s3cret"},
        )
        assert response.status_code == 200
        assert response.json() == {"matched": 2}
        dm.get_transport_ingress.assert_called_once_with("my-webhook")
        (request,) = target.requests
        # The whole path after /ingress/ is the topic.
        assert request.topic == "room1/snapshot"
        assert request.payload == b'{"temperature": 21.5}'
        assert request.headers["x-custom"] == "Value"
        assert request.headers["authorization"] == "Bearer s3cret"
        assert request.query == {"source": "app1"}

    def test_unknown_topic_returns_200_with_zero_matched(
        self, client: TestClient, dm: MagicMock
    ):
        dm.get_transport_ingress.return_value = _FakeIngressTarget(matched=0)
        response = client.post("/my-webhook/ingress/unknown", content=b"{}")
        assert response.status_code == 200
        assert response.json() == {"matched": 0}

    def test_transport_not_found_returns_404(self, client: TestClient, dm: MagicMock):
        dm.get_transport_ingress.side_effect = NotFoundError("Transport not found")
        response = client.post("/unknown/ingress/topic", content=b"{}")
        assert response.status_code == 404

    def test_unauthorized_returns_401_with_generic_detail(
        self, client: TestClient, dm: MagicMock
    ):
        target = MagicMock()
        target.ingress = AsyncMock(side_effect=UnauthorizedError("Invalid token"))
        dm.get_transport_ingress.return_value = target
        response = client.post("/my-webhook/ingress/topic", content=b"{}")
        assert response.status_code == 401
        # Generic message: the credential failure reason must not leak.
        assert response.json() == {"detail": "Unauthorized"}

    def test_invalid_payload_returns_422(self, client: TestClient, dm: MagicMock):
        target = MagicMock()
        target.ingress = AsyncMock(side_effect=InvalidError("Payload must be UTF-8"))
        dm.get_transport_ingress.return_value = target
        response = client.post("/my-webhook/ingress/topic", content=b"\xff\xfe")
        assert response.status_code == 422

    def test_oversized_body_returns_413(self, client: TestClient, dm: MagicMock):
        dm.get_transport_ingress.return_value = _FakeIngressTarget()
        response = client.post(
            "/my-webhook/ingress/topic",
            content=b"x" * (MAX_INGRESS_BODY_BYTES + 1),
        )
        assert response.status_code == 413
        dm.get_transport_ingress.assert_not_called()

    def test_oversized_chunked_body_returns_413(
        self, client: TestClient, dm: MagicMock
    ):
        # A chunked request carries no content-length, so only the streaming
        # accumulator can stop it — the guard that matters on a public
        # endpoint (a hostile client can also just lie in content-length).
        def chunks() -> Iterator[bytes]:
            for _ in range(3):
                yield b"x" * (MAX_INGRESS_BODY_BYTES // 2)

        dm.get_transport_ingress.return_value = _FakeIngressTarget()
        response = client.post("/my-webhook/ingress/topic", content=chunks())
        assert response.status_code == 413
        dm.get_transport_ingress.assert_not_called()


class TestGetTransportSchemas:
    def test_returns_schemas(self, client: TestClient):
        response = client.get("/schemas/")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == len(TransportProtocols)
        assert data["mqtt"]["properties"]["port"]["type"] == "integer"
