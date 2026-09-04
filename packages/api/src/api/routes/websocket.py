import asyncio
import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from starlette.status import WS_1008_POLICY_VIOLATION

from api.auth import get_websocket_token_payload
from api.websocket.manager import WebSocketManager
from api.websocket.schemas import PongMessage
from users.auth import TokenPayload

logger = logging.getLogger(__name__)

router = APIRouter()

# Negotiated in place of the `gridone.auth.bearer.<jwt>` offer, so the token is
# never echoed back in the handshake response.
_SUBPROTOCOL = "gridone"


def get_websocket_manager(websocket: WebSocket) -> WebSocketManager:
    """Get the WebSocketManager from the app state for WebSocket endpoints."""
    return websocket.app.state.websocket_manager


@router.websocket("/ws/devices")
async def websocket_endpoint(
    websocket: WebSocket,
    manager: WebSocketManager = Depends(get_websocket_manager),
    payload: TokenPayload = Depends(get_websocket_token_payload),
) -> None:
    connection_id = await manager.connect(websocket, subprotocol=_SUBPROTOCOL)

    try:
        # The session lives no longer than the access token that opened it:
        # nginx's proxy_read_timeout resets on every broadcast, so an idle
        # deadline would never fire on a busy feed.
        async with asyncio.timeout((payload.exp - datetime.now(UTC)).total_seconds()):
            while True:
                try:
                    raw_message = await websocket.receive_text()
                except WebSocketDisconnect:
                    break

                try:
                    message = json.loads(raw_message)
                except json.JSONDecodeError:
                    continue

                if isinstance(message, dict) and message.get("type") == "ping":
                    await websocket.send_text(PongMessage().model_dump_json())
    except TimeoutError:
        await websocket.close(code=WS_1008_POLICY_VIOLATION, reason="Token expired")
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.debug("WebSocket connection closed with error", exc_info=True)
    finally:
        await manager.disconnect(connection_id)
