import json

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from users.auth import AuthService, InvalidTokenError

from api.websocket.manager import WebSocketManager
from api.websocket.schemas import PongMessage

router = APIRouter()

_WS_CLOSE_AUTH_FAILED = 4001


def get_websocket_manager(websocket: WebSocket) -> WebSocketManager:
    """Get the WebSocketManager from the app state for WebSocket endpoints."""
    return websocket.app.state.websocket_manager


def get_auth_service(websocket: WebSocket) -> AuthService:
    return websocket.app.state.auth_service


@router.websocket("/ws")
@router.websocket("/ws/devices")
async def websocket_endpoint(
    websocket: WebSocket,
    manager: WebSocketManager = Depends(get_websocket_manager),
    auth_service: AuthService = Depends(get_auth_service),
    token: str | None = Query(None),
) -> None:
    if not token:
        await websocket.close(code=_WS_CLOSE_AUTH_FAILED, reason="Missing token")
        return
    try:
        auth_service.decode_token(token)
    except InvalidTokenError:
        await websocket.close(code=_WS_CLOSE_AUTH_FAILED, reason="Invalid token")
        return

    connection_id = await manager.connect(websocket)

    try:
        while True:
            try:
                raw_message = await websocket.receive_text()
            except WebSocketDisconnect:
                break

            try:
                payload = json.loads(raw_message)
            except json.JSONDecodeError:
                continue

            if isinstance(payload, dict) and payload.get("type") == "ping":
                await websocket.send_text(PongMessage().model_dump_json())
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await manager.disconnect(connection_id)
