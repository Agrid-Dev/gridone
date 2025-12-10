import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from api.websocket.manager import WebSocketManager
from api.websocket.schemas import PongMessage

router = APIRouter()


def get_websocket_manager(websocket: WebSocket) -> WebSocketManager:
    """Get the WebSocketManager from the app state for WebSocket endpoints."""
    return websocket.app.state.websocket_manager


@router.websocket("/ws")
@router.websocket("/ws/devices")
async def websocket_endpoint(
    websocket: WebSocket,
    manager: WebSocketManager = Depends(get_websocket_manager),
) -> None:
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
