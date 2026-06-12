from typing import Annotated

from pydantic import Field, PositiveInt

from devices_manager.core.transports.base_transport_config import (
    HOST_PATTERN,
    BaseTransportConfig,
)

MBUS_DEFAULT_BAUD_RATE = 2400


class MBusTransportConfig(BaseTransportConfig):
    host: Annotated[
        str,
        Field(
            min_length=1,
            pattern=HOST_PATTERN,
            description="Hostname or IP address of the M-Bus/TCP gateway "
            "(no spaces, no protocol like tcp://)",
            examples=["192.168.1.10", "mbus-gateway.local"],
        ),
    ]
    # No default port: M-Bus over IP has no well-known port, and a missing
    # port must fail validation (returns 4xx) rather than silently default.
    port: PositiveInt
    baud_rate: PositiveInt = MBUS_DEFAULT_BAUD_RATE
