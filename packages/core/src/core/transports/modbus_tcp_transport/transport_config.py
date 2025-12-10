from pydantic import PositiveInt

from core.transports.transport_config import TransportConfig

MODBUS_TCP_DEFAULT_PORT = 502


class ModbusTCPTransportConfig(TransportConfig):
    host: str
    port: PositiveInt = MODBUS_TCP_DEFAULT_PORT
