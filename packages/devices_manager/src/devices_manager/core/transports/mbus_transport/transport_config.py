from typing import Annotated, Literal

from pydantic import Field, PositiveInt

from devices_manager.core.transports.base_transport_config import (
    HOST_PATTERN,
    BaseTransportConfig,
)

MBUS_DEFAULT_BAUD_RATE = 2400


class _MBusTcpBase(BaseTransportConfig):
    """Shared host/port for TCP-based M-Bus modes (rfc2217, socket)."""

    host: Annotated[
        str,
        Field(
            min_length=1,
            pattern=HOST_PATTERN,
            description="Hostname or IP address of the M-Bus/TCP gateway",
            examples=["192.168.1.10", "mbus-gateway.local"],
        ),
    ]
    # No default port: missing port must fail validation rather than silently default.
    port: PositiveInt


class MBusRfc2217Config(_MBusTcpBase):
    """RFC 2217 (Telnet serial-over-TCP) — works with the M-Bus emulator."""

    mode: Literal["rfc2217"] = "rfc2217"
    baud_rate: PositiveInt = MBUS_DEFAULT_BAUD_RATE


class MBusSocketConfig(_MBusTcpBase):
    """Raw TCP socket — works with ser2net on real hardware."""

    mode: Literal["socket"] = "socket"


class MBusSerialConfig(BaseTransportConfig):
    """Direct USB/serial dongle — no IP bridge needed."""

    mode: Literal["serial"] = "serial"
    device: Annotated[
        str,
        Field(
            min_length=1,
            description="Serial device path",
            examples=["/dev/ttyUSB0", "/dev/ttyS0"],
        ),
    ]
    baud_rate: PositiveInt = MBUS_DEFAULT_BAUD_RATE


MBusTransportConfig = Annotated[
    MBusRfc2217Config | MBusSocketConfig | MBusSerialConfig,
    Field(discriminator="mode"),
]
