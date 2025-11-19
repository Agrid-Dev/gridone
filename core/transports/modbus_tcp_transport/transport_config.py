from pydantic import BaseModel, PositiveInt

MODBUS_TCP_DEFAULT_PORT = 502


class ModbusTCPTransportConfig(BaseModel):
    host: str
    port: PositiveInt = MODBUS_TCP_DEFAULT_PORT
