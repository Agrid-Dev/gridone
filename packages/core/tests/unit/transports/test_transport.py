import pytest
from core.transports.factory import Transport
from core.transports.modbus_tcp_transport.transport_config import (
    ModbusTCPTransportConfig,
)
from core.types import TransportProtocols
from pydantic import TypeAdapter, ValidationError


def test_transport_valid_config():
    raw = {
        "protocol": TransportProtocols.MODBUS_TCP,
        "config": {
            "host": "127.0.0.1",
            "port": 502,
        },
    }
    transport = TypeAdapter(Transport).validate_python(raw)
    assert transport.protocol == TransportProtocols.MODBUS_TCP
    assert isinstance(transport.config, ModbusTCPTransportConfig)


def test_transport_invalid_config():
    raw = {
        "protocol": TransportProtocols.MODBUS_TCP,
        "config": {"field": "invalid"},
    }
    with pytest.raises(ValidationError):
        TypeAdapter(Transport).validate_python(raw)
