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


def test_from_dict_round_trips_status_and_info():
    state = TransportConnectionState.from_dict({"status": "error", "info": "boom"})
    assert state.status == ConnectionStatus.ERROR
    assert state.info == "boom"


@pytest.mark.parametrize("data", [None, {}])
def test_from_dict_defaults_to_idle_when_empty(data):
    assert TransportConnectionState.from_dict(data).status == ConnectionStatus.IDLE
