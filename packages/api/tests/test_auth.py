"""Unit tests for the transport-specific half of `api.auth`."""

from unittest.mock import MagicMock

import pytest

from api.auth import _websocket_credential


def _websocket(
    *, subprotocols: list[str], authorization: str | None = None
) -> MagicMock:
    websocket = MagicMock()
    websocket.scope = {"subprotocols": subprotocols}
    websocket.headers = {"authorization": authorization} if authorization else {}
    return websocket


class TestWebsocketCredential:
    @pytest.mark.parametrize(
        ("test_id", "websocket", "expected"),
        [
            (
                "subprotocol-offer",
                _websocket(subprotocols=["gridone", "gridone.auth.bearer.jwt-value"]),
                "jwt-value",
            ),
            (
                "authorization-header",
                _websocket(subprotocols=[], authorization="Bearer jwt-value"),
                "jwt-value",
            ),
            (
                "authorization-scheme-is-case-insensitive",
                _websocket(subprotocols=[], authorization="bearer jwt-value"),
                "jwt-value",
            ),
            (
                "subprotocol-wins-over-header",
                _websocket(
                    subprotocols=["gridone.auth.bearer.from-subprotocol"],
                    authorization="Bearer from-header",
                ),
                "from-subprotocol",
            ),
            ("no-credential", _websocket(subprotocols=["gridone"]), None),
            (
                "unrelated-subprotocol",
                _websocket(subprotocols=["gridone", "chat"]),
                None,
            ),
            (
                "wrong-authorization-scheme",
                _websocket(subprotocols=[], authorization="Basic jwt-value"),
                None,
            ),
            (
                "empty-bearer",
                _websocket(subprotocols=[], authorization="Bearer"),
                None,
            ),
        ],
    )
    def test_reads_the_token_from_the_handshake(
        self, test_id: str, websocket: MagicMock, expected: str | None
    ) -> None:
        assert _websocket_credential(websocket) == expected, test_id
