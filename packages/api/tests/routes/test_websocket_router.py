from unittest.mock import AsyncMock

import pytest

from api.routes.websocket import websocket_endpoint
from api.websocket.manager import WebSocketManager

pytestmark = pytest.mark.asyncio


async def test_unexpected_exception_triggers_disconnect():
    """Outer except Exception handler fires on non-WebSocketDisconnect errors."""
    ws = AsyncMock()
    manager = AsyncMock(spec=WebSocketManager)
    manager.connect.return_value = "conn-id"
    ws.receive_text.side_effect = RuntimeError("unexpected transport error")

    await websocket_endpoint(websocket=ws, manager=manager)

    manager.disconnect.assert_awaited_once_with("conn-id")
