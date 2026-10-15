import asyncio
import contextlib
import json
from collections.abc import Callable, Iterable
from typing import Any
from uuid import uuid4

from fastapi import WebSocket

from api.access import UNRESTRICTED, AccessPolicy


class WebSocketManager:
    """Track active WebSocket connections and broadcast messages.

    Each connection carries the policy compiled from its caller's role when it
    opened; a broadcast with a projector sends every connection what its
    policy lets it see, or nothing.
    """

    def __init__(self) -> None:
        self.active_connections: dict[str, WebSocket] = {}
        self._policies: dict[str, AccessPolicy] = {}
        self._lock = asyncio.Lock()

    async def connect(
        self,
        websocket: WebSocket,
        *,
        policy: AccessPolicy = UNRESTRICTED,
        subprotocol: str | None = None,
    ) -> str:
        """Accept a connection and register it with the policy it reads through."""
        connection_id = str(uuid4())
        await websocket.accept(subprotocol=subprotocol)

        async with self._lock:
            self.active_connections[connection_id] = websocket
            self._policies[connection_id] = policy

        return connection_id

    async def disconnect(self, connection_id: str) -> None:
        """Remove a connection if it exists."""
        async with self._lock:
            websocket = self.active_connections.pop(connection_id, None)
            self._policies.pop(connection_id, None)

        if websocket:
            with contextlib.suppress(Exception):
                await websocket.close()

    async def broadcast(
        self,
        message: Any,  # noqa: ANN401
        *,
        project: Callable[[AccessPolicy], Any] | None = None,
    ) -> None:
        """Send a message to every connected client.

        ``project`` maps a connection's policy to the message it may receive,
        or ``None`` to skip it; without one, every connection gets ``message``.
        Serialisation happens once per distinct policy, so the shared
        unrestricted policy costs one pass however many clients hold it.
        """
        if not self.active_connections:
            return

        payloads: dict[int, str | None] = {}

        def payload_for(policy: AccessPolicy) -> str | None:
            key = id(policy)
            if key not in payloads:
                projected = message if project is None else project(policy)
                payloads[key] = (
                    None if projected is None else self._serialize(projected)
                )
            return payloads[key]

        stale_connections: list[str] = []
        async with self._lock:
            for connection_id, connection in self.active_connections.items():
                payload = payload_for(self._policies[connection_id])
                if payload is None:
                    continue
                try:
                    await connection.send_text(payload)
                except Exception:  # noqa: BLE001
                    stale_connections.append(connection_id)

            for connection_id in stale_connections:
                self.active_connections.pop(connection_id, None)
                self._policies.pop(connection_id, None)

    async def close_all(self) -> None:
        """Close every active connection (used during shutdown)."""
        connection_ids = list(self.active_connections.keys())
        for connection_id in connection_ids:
            await self.disconnect(connection_id)

    @staticmethod
    def _serialize(message: Any) -> str:  # noqa: ANN401
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
