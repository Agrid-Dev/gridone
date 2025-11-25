from bacpypes3.ipv4.app import NormalApplication
from bacpypes3.local.device import DeviceObject
from bacpypes3.pdu import IPv4Address

from .transport_config import BacnetTransportConfig


def make_local_application(config: BacnetTransportConfig) -> NormalApplication:
    """Create a BACpypes3 application bound to the local IPv4 interface."""
    # Use IPv4Address with CIDR so broadcast works correctly
    ipv4_address = IPv4Address(config.ip_with_mask, config.port)

    device_object = DeviceObject(
        objectIdentifier=("device", config.local_device_instance),
        objectName=config.local_device_name,
        maxApduLengthAccepted=config.max_apdu_length,
        segmentationSupported=config.segmentation_supported,
        vendorIdentifier=config.vendor_identifier,
    )

    return NormalApplication(device_object, ipv4_address)
