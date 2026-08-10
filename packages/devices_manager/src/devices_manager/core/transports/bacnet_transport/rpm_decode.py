from bacpypes3.apdu import ReadPropertyMultipleACK
from bacpypes3.basetypes import PropertyIdentifier
from bacpypes3.constructeddata import AnyAtomic
from bacpypes3.primitivedata import ObjectIdentifier

from devices_manager.core.transports.bacnet_transport.bacnet_address import (
    BacnetAddress,
)
from devices_manager.core.transports.bacnet_transport.rpm_plan import RpmRequest
from devices_manager.types import AttributeValueType


def to_native(value: object) -> AttributeValueType:
    """Convert a bacpypes3 atomic value to a plain Python primitive.

    `get_value()` returns wrappers (Real, Unsigned, Enumerated, ...) that
    subclass float/int/str, so they pass isinstance checks downstream but break
    exact-type lookups (e.g. timeseries `type(value)`). Order matters: bool
    before int, since bool is an int subclass.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return int(value)
    if isinstance(value, float):
        return float(value)
    if isinstance(value, str):
        return str(value)
    return value  # ty: ignore[invalid-return-type]


def decode_property_value(container: object) -> AttributeValueType:
    """Unwrap a bacpypes3 ``Any``-typed property value into a plain Python
    primitive — the same cast used for both a single ReadProperty ACK and
    one element of a ReadPropertyMultiple ACK."""
    return to_native(container.cast_out(AnyAtomic).get_value())  # ty: ignore[unresolved-attribute]


def decode_rpm(
    rpm_request: RpmRequest, ack: ReadPropertyMultipleACK
) -> list[tuple[BacnetAddress, AttributeValueType | Exception]]:
    """Split one RPM ACK back into a value or error per member address.

    Every address in ``rpm_request.addresses`` is guaranteed exactly one
    entry in the result: a ``propertyAccessError`` element yields an error
    for that address without failing the others, and an address the ACK
    omits entirely (partial/buggy RPM support) is reported as an error
    rather than silently dropped — the caller must be able to treat "no
    entry" as impossible. Two addresses sharing one (object, property) — e.g.
    differing only in write_priority — both receive the same decoded result,
    since a device answers a property once regardless of how many addresses
    reference it.
    """
    by_key: dict[tuple[ObjectIdentifier, PropertyIdentifier], list[BacnetAddress]] = {}
    for address in rpm_request.addresses:
        key = (
            ObjectIdentifier(f"{address.object_type},{address.object_instance}"),
            PropertyIdentifier(address.property_name),
        )
        by_key.setdefault(key, []).append(address)

    results: dict[str, tuple[BacnetAddress, AttributeValueType | Exception]] = {
        address.id: (
            address,
            RuntimeError(
                f"BACnet read-property-multiple response for device "
                f"{rpm_request.device_instance} omitted "
                f"{address.object_type}:{address.object_instance} "
                f"{address.property_name}"
            ),
        )
        for address in rpm_request.addresses
    }
    for access_result in ack.listOfReadAccessResults:  # ty: ignore[not-iterable]
        for element in access_result.listOfResults:
            addresses = by_key.get(
                (access_result.objectIdentifier, element.propertyIdentifier), []
            )
            if not addresses:
                continue
            choice = element.readResult
            if choice.propertyAccessError is not None:
                error = choice.propertyAccessError
                value: AttributeValueType | Exception = RuntimeError(
                    f"BACnet error on read-property-multiple to "
                    f"{access_result.objectIdentifier} "
                    f"{element.propertyIdentifier}: "
                    f"{error.errorClass}:{error.errorCode}"
                )
            else:
                value = decode_property_value(choice.propertyValue)
            for address in addresses:
                results[address.id] = (address, value)
    return list(results.values())
