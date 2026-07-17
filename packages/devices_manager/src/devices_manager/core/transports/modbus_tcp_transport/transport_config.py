from typing import Annotated

from pydantic import Field, NonNegativeInt, PositiveFloat, PositiveInt

from devices_manager.core.transports.base_transport_config import (
    HOST_PATTERN,
    BaseTransportConfig,
)

MODBUS_TCP_DEFAULT_PORT = 502
DEFAULT_READ_TIMEOUT = 3.0  # seconds, matches pymodbus's own default
# A single FC03/FC04 response cannot carry more than 125 registers.
MODBUS_MAX_REGISTERS_PER_READ = 125
DEFAULT_MAX_BLOCK = 100
DEFAULT_MAX_GAP = 0


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
    max_block: Annotated[
        int,
        Field(
            ge=1,
            le=MODBUS_MAX_REGISTERS_PER_READ,
            description=(
                "Largest contiguous run of registers/bits fetched in one read. "
                "Lower it for gateways that reject full-size requests."
            ),
        ),
    ] = DEFAULT_MAX_BLOCK
    max_gap: Annotated[
        NonNegativeInt,
        Field(
            description=(
                "Largest hole between two attributes' addresses that is read "
                "and discarded to keep them in one request. 0 merges only "
                "strictly contiguous addresses."
            ),
        ),
    ] = DEFAULT_MAX_GAP
