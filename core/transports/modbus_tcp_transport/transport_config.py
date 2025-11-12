from pydantic import BaseModel, PositiveInt


class ModbusTCPTransportConfig(BaseModel):
    host: str
    port: PositiveInt = 502
