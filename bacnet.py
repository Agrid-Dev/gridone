"""
Minimal BACnet read-property script for your thermostat on MS/TP
behind the Intesis IP/MS-TP router, using bacpypes3.
"""

from __future__ import annotations

import asyncio

from bacpypes3.apdu import ReadPropertyACK, ReadPropertyRequest
from bacpypes3.basetypes import Segmentation
from bacpypes3.constructeddata import AnyAtomic
from bacpypes3.ipv4.app import NormalApplication
from bacpypes3.local.device import DeviceObject
from bacpypes3.pdu import Address, IPv4Address
from bacpypes3.primitivedata import ObjectIdentifier

# ---------- configuration ----------

LOCAL_IP = "10.125.0.1/24"  # your BACnet/IP interface on vlan25 + mask
LOCAL_PORT = 47808  # BAC0
LOCAL_DEVICE_INSTANCE = 990001  # any unique instance on the network
LOCAL_DEVICE_NAME = "GridOne BACnet Client"

TARGET_DEVICE_INSTANCE = 856402  # thermostat device instance
OBJECT_TYPE = "analog-value"  # note the dash form for ObjectIdentifier
OBJECT_INSTANCE = 3
PROPERTY_NAME = "present-value"  # use dash form


DISCOVERY_TIMEOUT = 10.0  # seconds
READ_PROPERTY_TIMEOUT = 5.0  # seconds


def make_local_application() -> NormalApplication:
    """Create a BACpypes3 application bound to the local IPv4 interface."""
    # Use IPv4Address with CIDR so broadcast works correctly
    ipv4_address = IPv4Address(LOCAL_IP, LOCAL_PORT)

    device_object = DeviceObject(
        objectIdentifier=("device", LOCAL_DEVICE_INSTANCE),
        objectName=LOCAL_DEVICE_NAME,
        maxApduLengthAccepted=1024,
        segmentationSupported=Segmentation.noSegmentation,
        vendorIdentifier=999,
    )

    return NormalApplication(device_object, ipv4_address)


async def discover_device(app: NormalApplication) -> tuple[Address, ObjectIdentifier]:
    """
    Send a Who-Is for the specific device instance and return:
      - device_address: routed Address (e.g. 100:2@10.125.0.129)
      - device_identifier: ObjectIdentifier("device,856402")
    """
    # who_is(low_limit, high_limit) → list of I-Am responses
    i_ams = await asyncio.wait_for(
        app.who_is(),
        timeout=DISCOVERY_TIMEOUT,
    )

    for i_am in i_ams:
        device_address: Address = i_am.pduSource
        device_identifier: ObjectIdentifier = i_am.iAmDeviceIdentifier

        if device_identifier[1] == TARGET_DEVICE_INSTANCE:
            return device_address, device_identifier

    raise TimeoutError(f"No I-Am received from device {TARGET_DEVICE_INSTANCE}")


async def read_setpoint(app: NormalApplication, device_address: Address) -> float:
    """Low-level ReadProperty of analog-value 3 present-value."""
    obj_id = ObjectIdentifier(f"{OBJECT_TYPE},{OBJECT_INSTANCE}")

    request = ReadPropertyRequest(
        objectIdentifier=obj_id,
        propertyIdentifier=PROPERTY_NAME,
    )
    request.pduDestination = device_address

    # send APDU and wait for response
    response = await asyncio.wait_for(
        app.request(request),
        timeout=READ_PROPERTY_TIMEOUT,
    )

    if not isinstance(response, ReadPropertyACK):
        raise RuntimeError(f"Unexpected response: {response!r}")

    # Extract the value from the ACK
    return response.propertyValue.cast_out(AnyAtomic).get_value()


async def main() -> int:
    app = make_local_application()
    try:
        # 1) Discover the thermostat through the Intesis router
        device_address, device_identifier = await discover_device(app)
        print(f"Discovered {device_identifier} at {device_address}")

        # 2) Read AV3 present-value
        setpoint = await read_setpoint(app, device_address)

        print(
            f"{OBJECT_TYPE} {OBJECT_INSTANCE} present-value -> {setpoint} "
            f"(device {TARGET_DEVICE_INSTANCE})"
        )
        return 0
    except (TimeoutError, Exception) as err:
        print(f"Failed to read property: {err}")
        return 1
    finally:
        app.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
