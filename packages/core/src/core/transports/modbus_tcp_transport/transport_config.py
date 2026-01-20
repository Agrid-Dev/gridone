from typing import Annotated

from pydantic import Field, PositiveInt

from core.transports.base_transport_config import BaseTransportConfig

MODBUS_TCP_DEFAULT_PORT = 502


HOST_PATTERN = r"^[^\s:/]+(\.[^\s:/]+)*$"


class ModbusTCPTransportConfig(BaseTransportConfig):
    host: Annotated[
        str,
        Field(
            min_length=1,
            pattern=HOST_PATTERN,
            description="Hostname or IP address (no spaces, no protocol like tcp://)",
            examples=["192.168.1.10", "plc.local", "modbus-server"],
        ),
    ]
    port: PositiveInt = MODBUS_TCP_DEFAULT_PORT
