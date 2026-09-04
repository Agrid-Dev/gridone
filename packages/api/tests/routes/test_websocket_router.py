from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.routing import APIWebSocketRoute
from fastapi.testclient import TestClient
from jose import jwt
from starlette.websockets import WebSocketDisconnect

from api.dependencies import get_users_service
from api.routes.websocket import router as websocket_router
from api.routes.websocket import websocket_endpoint
from api.websocket.manager import WebSocketManager
from users import Role, User
from users.auth import AuthService, TokenPayload

_SECRET = "test-secret"  # noqa: S105
_PATH = "/ws/devices"

_USERS = {
    "admin-id": User(id="admin-id", username="admin", role=Role.ADMIN),
    "operator-id": User(id="operator-id", username="operator", role=Role.OPERATOR),
    "viewer-id": User(id="viewer-id", username="viewer", role=Role.VIEWER),
    "blocked-id": User(
        id="blocked-id", username="blocked", role=Role.ADMIN, is_blocked=True
    ),
}


class _UsersService:
    async def is_blocked(self, user_id: str) -> bool:
        user = _USERS.get(user_id)
        return user is not None and user.is_blocked


def _token(
    *,
    sub: str = "admin-id",
    role: str = "admin",
    ttl_seconds: float = 300,
    kind: str = "access",
    secret: str = _SECRET,
) -> str:
    """Mint a JWT with an arbitrary TTL — `AuthService` only offers whole minutes."""
    claims = {
        "sub": sub,
        "role": role,
        "exp": datetime.now(UTC) + timedelta(seconds=ttl_seconds),
        "type": kind,
    }
    return jwt.encode(claims, secret, algorithm="HS256")


def _bearer_subprotocols(token: str) -> list[str]:
    return ["gridone", f"gridone.auth.bearer.{token}"]


@pytest.fixture
def manager() -> WebSocketManager:
    return WebSocketManager()


@pytest.fixture
def app(manager: WebSocketManager) -> FastAPI:
    app = FastAPI()
    app.state.auth_service = AuthService(secret_key=_SECRET)
    app.state.websocket_manager = manager
    app.dependency_overrides[get_users_service] = _UsersService
    app.include_router(websocket_router)
    return app


class TestHandshakeRejection:
    """No credential, or a credential we cannot trust, never reaches `accept()`.

    Starlette surfaces the pre-accept close as `WebSocketDisconnect(1008)`; on the
    wire uvicorn turns it into an HTTP 403 handshake rejection instead. Either way
    the socket is never accepted and never registered.
    """

    def test_anonymous_connection_is_rejected(
        self, app: FastAPI, manager: WebSocketManager
    ) -> None:
        with (
            TestClient(app) as client,
            pytest.raises(WebSocketDisconnect) as excinfo,
            client.websocket_connect(_PATH),
        ):
            pass  # pragma: no cover - the handshake raises before the body runs

        assert excinfo.value.code == 1008
        assert manager.active_connections == {}

    @pytest.mark.parametrize(
        ("test_id", "token", "reason"),
        [
            ("malformed", "not-a-jwt", "Not authenticated"),
            ("wrong-secret", _token(secret="another-secret"), "Not authenticated"),
            ("expired", _token(ttl_seconds=-1), "Not authenticated"),
            ("refresh-token", _token(kind="refresh"), "Not authenticated"),
            ("blocked-account", _token(sub="blocked-id"), "Account is blocked"),
        ],
    )
    def test_untrusted_token_is_rejected(
        self,
        app: FastAPI,
        manager: WebSocketManager,
        test_id: str,
        token: str,
        reason: str,
    ) -> None:
        with (
            TestClient(app) as client,
            pytest.raises(WebSocketDisconnect) as excinfo,
            client.websocket_connect(_PATH, subprotocols=_bearer_subprotocols(token)),
        ):
            pass  # pragma: no cover - the handshake raises before the body runs

        assert excinfo.value.code == 1008, test_id
        assert excinfo.value.reason == reason, test_id
        assert manager.active_connections == {}

    def test_malformed_subprotocol_offer_is_rejected(
        self, app: FastAPI, manager: WebSocketManager
    ) -> None:
        with (
            TestClient(app) as client,
            pytest.raises(WebSocketDisconnect) as excinfo,
            client.websocket_connect(_PATH, subprotocols=["gridone", "something-else"]),
        ):
            pass  # pragma: no cover - the handshake raises before the body runs

        assert excinfo.value.code == 1008
        assert manager.active_connections == {}

    def test_devices_is_the_only_websocket_path(self) -> None:
        """The bare `/ws` alias is gone; the UI only ever built `/ws/devices`."""
        paths = [
            route.path
            for route in websocket_router.routes
            if isinstance(route, APIWebSocketRoute)
        ]
        assert paths == [_PATH]


class TestHandshakeAcceptance:
    @pytest.mark.parametrize(
        ("user_id", "role"),
        [("admin-id", "admin"), ("operator-id", "operator"), ("viewer-id", "viewer")],
    )
    def test_every_role_is_accepted(
        self, app: FastAPI, manager: WebSocketManager, user_id: str, role: str
    ) -> None:
        token = _token(sub=user_id, role=role)

        with (
            TestClient(app) as client,
            client.websocket_connect(
                _PATH, subprotocols=_bearer_subprotocols(token)
            ) as ws,
        ):
            # The connection is registered, so `broadcast` reaches it.
            assert len(manager.active_connections) == 1
            ws.send_text('{"type": "ping"}')
            assert '"pong"' in ws.receive_text()

    def test_negotiated_subprotocol_never_echoes_the_token(self, app: FastAPI) -> None:
        token = _token()

        with (
            TestClient(app) as client,
            client.websocket_connect(
                _PATH, subprotocols=_bearer_subprotocols(token)
            ) as ws,
        ):
            assert ws.accepted_subprotocol == "gridone"
            assert token not in (ws.accepted_subprotocol or "")

    def test_authorization_header_is_accepted_for_non_browser_clients(
        self, app: FastAPI, manager: WebSocketManager
    ) -> None:
        token = _token()

        with (
            TestClient(app) as client,
            client.websocket_connect(
                _PATH, headers={"Authorization": f"Bearer {token}"}
            ),
        ):
            assert len(manager.active_connections) == 1


class TestTokenDeadline:
    def test_open_socket_closes_when_the_access_token_expires(
        self, app: FastAPI
    ) -> None:
        token = _token(ttl_seconds=0.3)

        with (
            TestClient(app) as client,
            client.websocket_connect(
                _PATH, subprotocols=_bearer_subprotocols(token)
            ) as ws,
            pytest.raises(WebSocketDisconnect) as excinfo,
        ):
            ws.receive_text()

        assert excinfo.value.code == 1008
        assert excinfo.value.reason == "Token expired"


@pytest.mark.asyncio
async def test_unexpected_exception_triggers_disconnect() -> None:
    """Outer except Exception handler fires on non-WebSocketDisconnect errors."""
    ws = AsyncMock()
    manager = AsyncMock(spec=WebSocketManager)
    manager.connect.return_value = "conn-id"
    ws.receive_text.side_effect = RuntimeError("unexpected transport error")
    payload = TokenPayload(
        sub="admin-id", role="admin", exp=datetime.now(UTC) + timedelta(hours=1)
    )

    await websocket_endpoint(websocket=ws, manager=manager, payload=payload)

    manager.disconnect.assert_awaited_once_with("conn-id")
