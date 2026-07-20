from dataclasses import dataclass

from bacpypes3.apdu import (
    PropertyReference,
    ReadAccessSpecification,
    ReadPropertyMultipleRequest,
)
from bacpypes3.primitivedata import ObjectIdentifier

from .bacnet_address import BacnetAddress

# ASHRAE 135's guaranteed minimum max-APDU-length-accepted — the smallest
# value every conformant device must support. Used when a device's I-Am
# didn't report a usable Max-APDU.
DEFAULT_MAX_APDU = 50


@dataclass(frozen=True, slots=True)
class RpmRequest:
    device_instance: int
    specs: tuple[ReadAccessSpecification, ...]
    addresses: tuple[BacnetAddress, ...]


def _object_identifier(address: BacnetAddress) -> ObjectIdentifier:
    return ObjectIdentifier(f"{address.object_type},{address.object_instance}")


def _spec_size(spec: ReadAccessSpecification) -> int:
    """Bytes ``spec`` alone adds to a ReadPropertyMultipleRequest's wire
    encoding, via bacpypes3's own encoder rather than a guessed byte-cost
    table. BACnet's constructed-tag encoding is additive per element with no
    shared length-prefix overhead (verified: summing each spec's standalone
    encoded size always equals a combined request's encoded size, even past
    the ASN.1 128-byte length-prefix boundary), so this can be computed once
    per spec and summed by the caller instead of re-encoding the whole
    growing request on every append — the latter is O(n^2) in the number of
    objects on a device.
    """
    request = ReadPropertyMultipleRequest(listOfReadAccessSpecs=[spec])
    return len(request.encode().pduData)


def _group_by_object(
    addresses: list[BacnetAddress],
) -> list[tuple[ObjectIdentifier, list[BacnetAddress]]]:
    grouped: dict[ObjectIdentifier, list[BacnetAddress]] = {}
    for address in addresses:
        grouped.setdefault(_object_identifier(address), []).append(address)
    return list(grouped.items())


def _spec_for(
    obj_id: ObjectIdentifier, members: list[BacnetAddress]
) -> ReadAccessSpecification:
    return ReadAccessSpecification(
        objectIdentifier=obj_id,
        listOfPropertyReferences=[
            PropertyReference(propertyIdentifier=address.property_name)
            for address in members
        ],
    )


def plan_rpm(
    addresses: list[BacnetAddress],
    *,
    max_apdu_by_device: dict[int, int],
    request_apdu_fraction: float,
) -> list[RpmRequest]:
    """Coalesce addresses into the fewest ReadPropertyMultiple requests each
    device's Max-APDU allows. Partitioned by device_instance only — unlike
    Modbus, RPM freely mixes object types in one request. Addresses sharing
    one object become one ReadAccessSpecification; specs are packed in one at
    a time while a running total of each spec's real encoded size (see
    ``_spec_size``) stays within the device's budget — ``request_apdu_fraction``
    of its Max-APDU, since the response swaps each property reference for an
    encoded value plus its own framing, which the request doesn't carry. An
    object that alone exceeds the budget still gets a solo request rather
    than blocking its neighbours.
    """
    partitions: dict[int, list[BacnetAddress]] = {}
    for address in addresses:
        partitions.setdefault(address.device_instance, []).append(address)

    requests: list[RpmRequest] = []
    for device_instance, group in partitions.items():
        max_apdu = max_apdu_by_device.get(device_instance) or DEFAULT_MAX_APDU
        budget = max(1, int(max_apdu * request_apdu_fraction))
        specs: list[ReadAccessSpecification] = []
        members: list[BacnetAddress] = []
        used = 0
        for obj_id, obj_addresses in _group_by_object(group):
            spec = _spec_for(obj_id, obj_addresses)
            size = _spec_size(spec)
            if specs and used + size > budget:
                requests.append(
                    RpmRequest(device_instance, tuple(specs), tuple(members))
                )
                specs, members, used = [spec], list(obj_addresses), size
            else:
                specs.append(spec)
                members.extend(obj_addresses)
                used += size
        if specs:
            requests.append(RpmRequest(device_instance, tuple(specs), tuple(members)))
    return requests
