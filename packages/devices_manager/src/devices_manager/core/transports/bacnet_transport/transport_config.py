import ipaddress
from typing import Annotated

from bacpypes3.basetypes import Segmentation
from pydantic import AfterValidator, PositiveFloat, PositiveInt

from devices_manager.core.transports.base_transport_config import BaseTransportConfig

from .bacnet_types import BacnetWritePriority

DEFAULT_LOCAL_DEVICE_INSTANCE = 990001
DEFAULT_LOCAL_DEVICE_NAME = "GridOne BACnet Client"
DEFAULT_MAX_APDU_LENGTH = 1024
DEFAULT_VENDOR_IDENTIFIER = 999
DEFAULT_SEGMENTATION_SUPPORTED = Segmentation.noSegmentation
DEFAULT_PORT = 47808
DEFAULT_DISCOVERY_TIMEOUT = 5.0  # seconds
DEFAULT_FOREIGN_TTL = 900  # seconds, BBMD foreign-device registration lifetime
DEFAULT_READ_PROPERTY_TIMEOUT = 5.0  # seconds
DEFAULT_WRITE_PROPERTY_TIMEOUT = 5.0  # seconds
DEFAULT_WRITE_PRIORITY = 8

DEFAULT_MASK = "/24"


def is_valid_ip_with_mask(v: str) -> str:
    try:
        ipaddress.ip_network(v, strict=False)
        if "/" not in v:
            return v.strip() + DEFAULT_MASK
    except ValueError as e:
        msg = f"Invalid IP address with mask: {v}"
        raise ValueError(msg) from e
    return v


def validate_ip(v: str) -> str:
    try:
        ipaddress.ip_address(v.strip())
    except ValueError as e:
        msg = f"Invalid IP address: {v}"
        raise ValueError(msg) from e
    return v.strip()


class BacnetTransportConfig(BaseTransportConfig):
    # Local interface to bind, with mask so Who-Is broadcast works.
    ip_with_mask: Annotated[str, AfterValidator(is_valid_ip_with_mask)]
    port: PositiveInt = DEFAULT_PORT
    # Optional discovery target. When set, the client unicasts a directed Who-Is
    # here (works across a Docker bridge) instead of relying on a LAN broadcast.
    discovery_address: Annotated[str, AfterValidator(validate_ip)] | None = None
    # Optional BBMD to register with as a foreign device. Needed to discover
    # devices behind a router/BBMD from a NAT'd (containerized) client.
    bbmd_address: Annotated[str, AfterValidator(validate_ip)] | None = None
    foreign_ttl: PositiveInt = DEFAULT_FOREIGN_TTL
    local_device_instance: PositiveInt = DEFAULT_LOCAL_DEVICE_INSTANCE
    local_device_name: str = DEFAULT_LOCAL_DEVICE_NAME
    max_apdu_length: PositiveInt = DEFAULT_MAX_APDU_LENGTH
    vendor_identifier: PositiveInt = DEFAULT_VENDOR_IDENTIFIER
    segmentation_supported: PositiveInt = DEFAULT_SEGMENTATION_SUPPORTED
    discovery_timeout: PositiveFloat = DEFAULT_DISCOVERY_TIMEOUT
    read_property_timeout: PositiveFloat = DEFAULT_READ_PROPERTY_TIMEOUT
    write_property_timeout: PositiveFloat = DEFAULT_WRITE_PROPERTY_TIMEOUT
    default_write_priority: BacnetWritePriority = DEFAULT_WRITE_PRIORITY
