from unittest.mock import AsyncMock

import pytest

from api.websocket.manager import WebSocketManager

pytestmark = pytest.mark.asyncio


class TestConnect:
    async def test_accept_called_and_connection_registered(self):
        manager = WebSocketManager()
        ws = AsyncMock()

        connection_id = await manager.connect(ws)

        ws.accept.assert_awaited_once()
        assert connection_id in manager.active_connections
        assert manager.active_connections[connection_id] is ws


class TestDisconnect:
    async def test_close_called_on_registered_connection(self):
        manager = WebSocketManager()
        ws = AsyncMock()
        connection_id = await manager.connect(ws)

        await manager.disconnect(connection_id)

        ws.close.assert_awaited_once()
        assert connection_id not in manager.active_connections

    async def test_close_error_is_suppressed(self):
        manager = WebSocketManager()
        ws = AsyncMock()
        ws.close.side_effect = RuntimeError("already closed")
        connection_id = await manager.connect(ws)

        await manager.disconnect(connection_id)

        assert connection_id not in manager.active_connections

    async def test_unknown_connection_id_is_noop(self):
        manager = WebSocketManager()

        await manager.disconnect("does-not-exist")


class TestBroadcast:
    async def test_sends_to_all_connections(self):
        manager = WebSocketManager()
        ws1, ws2 = AsyncMock(), AsyncMock()
        await manager.connect(ws1)
        await manager.connect(ws2)

        await manager.broadcast({"event": "update"})

        assert ws1.send_text.await_count == 1
        assert ws2.send_text.await_count == 1

    async def test_stale_connection_removed_on_send_error(self):
        manager = WebSocketManager()
        ws1, ws2 = AsyncMock(), AsyncMock()
        ws1.send_text.side_effect = RuntimeError("disconnected")
        id1 = await manager.connect(ws1)
        await manager.connect(ws2)

        await manager.broadcast("ping")

        assert id1 not in manager.active_connections
        assert ws2.send_text.await_count == 1
