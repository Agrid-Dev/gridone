from unittest.mock import AsyncMock

import pytest

from api.access import AccessPolicy
from api.websocket.manager import WebSocketManager
from users.permissions import Permission
from users.roles import DeviceScope, Role

pytestmark = pytest.mark.asyncio


class TestConnect:
    async def test_accept_called_and_connection_registered(self):
        manager = WebSocketManager()
        ws = AsyncMock()

        connection_id = await manager.connect(ws)

        ws.accept.assert_awaited_once_with(subprotocol=None)
        assert connection_id in manager.active_connections
        assert manager.active_connections[connection_id] is ws

    async def test_negotiated_subprotocol_is_passed_to_accept(self):
        manager = WebSocketManager()
        ws = AsyncMock()

        await manager.connect(ws, subprotocol="gridone")

        ws.accept.assert_awaited_once_with(subprotocol="gridone")


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


def _restricted() -> AccessPolicy:
    return AccessPolicy.from_role(
        Role(
            id="r",
            name="r",
            permissions=[Permission.DEVICES_READ],
            scopes={Permission.DEVICES_READ: [DeviceScope(attributes=["temperature"])]},
        )
    )


class TestProjectedBroadcast:
    async def test_each_connection_gets_what_its_policy_allows(self):
        manager = WebSocketManager()
        admin, reader = AsyncMock(), AsyncMock()
        await manager.connect(admin)
        await manager.connect(reader, policy=_restricted())

        await manager.broadcast(
            {"attribute": "mode"},
            project=lambda policy: (
                None if not policy.is_unrestricted else {"attribute": "mode"}
            ),
        )

        assert admin.send_text.await_count == 1
        assert reader.send_text.await_count == 0

    async def test_a_projector_may_narrow_the_message(self):
        manager = WebSocketManager()
        reader = AsyncMock()
        await manager.connect(reader, policy=_restricted())

        await manager.broadcast(
            {"full": True},
            project=lambda policy: {"full": policy.is_unrestricted},
        )

        reader.send_text.assert_awaited_once_with('{"full": false}')

    async def test_serializes_once_per_policy(self):
        manager = WebSocketManager()
        sockets = [AsyncMock() for _ in range(3)]
        for ws in sockets:
            await manager.connect(ws)
        calls: list[AccessPolicy] = []

        def project(policy: AccessPolicy) -> dict:
            calls.append(policy)
            return {"n": len(calls)}

        await manager.broadcast({}, project=project)

        assert len(calls) == 1
        assert {ws.send_text.await_args.args[0] for ws in sockets} == {'{"n": 1}'}

    async def test_disconnect_forgets_the_policy(self):
        manager = WebSocketManager()
        ws = AsyncMock()
        connection_id = await manager.connect(ws, policy=_restricted())

        await manager.disconnect(connection_id)
        await manager.broadcast({}, project=lambda _: {})

        ws.send_text.assert_not_awaited()
