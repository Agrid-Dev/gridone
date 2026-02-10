import pytest
from devices_manager.core.transports.transport_connection_state import (
    ConnectionStatus,
    TransportConnectionState,
)


def test_transport_connection_state_is_connected():
    connected_status = ConnectionStatus.CONNECTED
    connected_tcs = TransportConnectionState(status=connected_status)
    assert connected_tcs.is_connected
    for status in ConnectionStatus:
        if status != connected_status:
            tcs = TransportConnectionState(status=status)
            assert not tcs.is_connected


@pytest.mark.parametrize(
    ("builder", "expected_status"),
    [
        (TransportConnectionState.idle, ConnectionStatus.IDLE),
        (TransportConnectionState.connecting, ConnectionStatus.CONNECTING),
        (TransportConnectionState.connected, ConnectionStatus.CONNECTED),
        (TransportConnectionState.connection_error, ConnectionStatus.CONNECTION_ERROR),
        (TransportConnectionState.closing, ConnectionStatus.CLOSING),
        (TransportConnectionState.closed, ConnectionStatus.CLOSED),
    ],
)
def test_quick_builders(builder, expected_status):
    assert builder().status == expected_status
