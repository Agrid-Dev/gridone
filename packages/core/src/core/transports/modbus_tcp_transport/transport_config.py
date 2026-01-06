from pydantic import PositiveInt

from core.transports.base_transport_config import BaseTransportConfig

MODBUS_TCP_DEFAULT_PORT = 502


class ModbusTCPTransportConfig(BaseTransportConfig):
    host: str
    port: PositiveInt = MODBUS_TCP_DEFAULT_PORT
