import pytest

from devices_manager.core.transports.transport_connection_state import (
    TransportConnectionState,
)
from devices_manager.types import ConnectionStatus


def test_transport_connection_state_is_connected():
    connected_tcs = TransportConnectionState(status=ConnectionStatus.OK)
    assert connected_tcs.is_connected
    for status in ConnectionStatus:
        if status != ConnectionStatus.OK:
            tcs = TransportConnectionState(status=status)
            assert not tcs.is_connected


@pytest.mark.parametrize(
    ("builder", "expected_status"),
    [
        (TransportConnectionState.idle, ConnectionStatus.IDLE),
        (TransportConnectionState.connected, ConnectionStatus.OK),
        (TransportConnectionState.connection_error, ConnectionStatus.ERROR),
        (TransportConnectionState.closed, ConnectionStatus.IDLE),
    ],
)
def test_quick_builders(builder, expected_status):
    assert builder().status == expected_status
