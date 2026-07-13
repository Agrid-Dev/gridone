from typing import Annotated

from pydantic import Field, PositiveFloat, PositiveInt

from devices_manager.core.transports.base_transport_config import (
    HOST_PATTERN,
    BaseTransportConfig,
)

MODBUS_TCP_DEFAULT_PORT = 502
DEFAULT_READ_TIMEOUT = 3.0  # seconds, matches pymodbus's own default


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
    read_timeout: PositiveFloat = DEFAULT_READ_TIMEOUT
