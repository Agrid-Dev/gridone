from bacpypes3.ipv4.app import ForeignApplication, NormalApplication
from bacpypes3.local.device import DeviceObject
from bacpypes3.pdu import IPv4Address

from .transport_config import BacnetTransportConfig


def make_local_application(
    config: BacnetTransportConfig,
) -> NormalApplication | ForeignApplication:
    """Create a BACpypes3 application bound to the local IPv4 interface.

    Uses a foreign-device application when a BBMD is configured, so discovery
    works from a NAT'd (containerized) client; a normal application otherwise.
    """
    device_object = DeviceObject(
        objectIdentifier=("device", config.local_device_instance),
        objectName=config.local_device_name,
        maxApduLengthAccepted=config.max_apdu_length,
        segmentationSupported=config.segmentation_supported,
        vendorIdentifier=config.vendor_identifier,
    )
    if config.discovery_address and not config.bbmd_address:
        # Directed (unicast) Who-Is only: bind an ephemeral port on any
        # interface. No broadcast socket is needed (it fails to bind on some
        # hosts), and an ephemeral port avoids clashing with a co-located device.
        return NormalApplication(device_object, IPv4Address("0.0.0.0/0:0"))
    # Broadcast / foreign-device discovery binds the real interface (+ mask, so
    # the broadcast address is correct) on the BACnet port.
    local_address = IPv4Address(config.ip_with_mask, config.port)
    if config.bbmd_address:
        return ForeignApplication(device_object, local_address)
    return NormalApplication(device_object, local_address)
