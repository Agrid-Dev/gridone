import asyncio
import json
from collections.abc import Iterable
from typing import Any
from uuid import uuid4

from fastapi import WebSocket


class WebSocketManager:
    """Track active WebSocket connections and broadcast messages."""

    def __init__(self) -> None:
        self.active_connections: dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> str:
        """Accept a connection and register it."""
        connection_id = str(uuid4())
        
        try:
            await websocket.accept()
        except Exception:
            raise
        
        async with self._lock:
            self.active_connections[connection_id] = websocket
        
        return connection_id

    async def disconnect(self, connection_id: str) -> None:
        """Remove a connection if it exists."""
        async with self._lock:
            websocket = self.active_connections.pop(connection_id, None)
        
        if websocket:
            try:
                await websocket.close()
            except Exception:
                pass

    async def broadcast(self, message: Any) -> None:
        """Send a message to all connected clients."""
        if not self.active_connections:
            return

        payload = self._serialize(message)
        
        stale_connections: list[str] = []
        async with self._lock:
            for connection_id, connection in self.active_connections.items():
                try:
                    await connection.send_text(payload)
                except Exception:
                    stale_connections.append(connection_id)

            for connection_id in stale_connections:
                self.active_connections.pop(connection_id, None)

    async def close_all(self) -> None:
        """Close every active connection (used during shutdown)."""
        connection_ids = list(self.active_connections.keys())
        for connection_id in connection_ids:
            await self.disconnect(connection_id)

    @staticmethod
    def _serialize(message: Any) -> str:
        if hasattr(message, "model_dump_json"):
            # Pydantic BaseModel supports this; keep consistent ISO formatting.
            return message.model_dump_json()
        if hasattr(message, "model_dump"):
            return json.dumps(message.model_dump(), default=str)
        if isinstance(message, dict):
            return json.dumps(message, default=str)
        if isinstance(message, str):
            return message
        if isinstance(message, Iterable):
            return json.dumps(list(message), default=str)
        return json.dumps(message, default=str)
