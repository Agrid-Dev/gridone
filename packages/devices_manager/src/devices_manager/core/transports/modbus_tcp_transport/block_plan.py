from dataclasses import dataclass

from .modbus_address import BIT_MODBUS_ADDRESS_TYPES, ModbusAddress, ModbusAddressType


@dataclass(frozen=True, slots=True)
class ModbusBlock:
    """A single request: ``count`` items from ``start``, serving every address
    in ``addresses``."""

    type: ModbusAddressType
    device_id: int
    start: int
    count: int
    addresses: tuple[ModbusAddress, ...]

    @property
    def is_bit(self) -> bool:
        """Whether this block reads bits (coils/discrete inputs) or registers."""
        return self.type in BIT_MODBUS_ADDRESS_TYPES

    def extract(
        self, address: ModbusAddress, payload: list[int] | list[bool]
    ) -> bool | int | list[int]:
        """Slice one address's value out of this block's payload.

        Returns the raw shape codecs already expect: a bit for C/DI, a bare int
        for a single register, a list of ints for count > 1.
        """
        offset = address.instance - self.start
        if self.is_bit:
            return payload[offset]
        registers = list(payload[offset : offset + address.count])
        if len(registers) != address.count:
            # Truncating instead would hand the codec fewer registers than its
            # type needs, decoding to garbage rather than failing the read.
            msg = (
                f"Block {self.type.value}{self.start}:{self.count} returned "
                f"{len(payload)} items, too short for {address.id}"
            )
            raise ValueError(msg)
        if address.count == 1:
            return registers[0]
        return registers


def _span_end(address: ModbusAddress) -> int:
    return address.instance + address.count - 1


def _build(
    address_type: ModbusAddressType,
    device_id: int,
    start: int,
    end: int,
    members: list[ModbusAddress],
) -> ModbusBlock:
    return ModbusBlock(
        type=address_type,
        device_id=device_id,
        start=start,
        count=end - start + 1,
        addresses=tuple(members),
    )


def plan_blocks(
    addresses: list[ModbusAddress], *, max_block: int, max_gap: int
) -> list[ModbusBlock]:
    """Coalesce addresses into the fewest block reads Modbus allows.

    Addresses are partitioned by ``(device_id, type)``, since one request can
    span neither slaves nor address types. Within a partition, sorted by
    instance, a block absorbs the next address when the hole between them is at
    most ``max_gap`` — those holes are read and discarded, which beats a second
    round-trip — and the resulting span still fits ``max_block``.

    A block never splits within one address's span: a fresh block always takes
    its first address whatever its width, so an address whose own ``count``
    exceeds ``max_block`` gets an oversized solo block and fails at the device
    exactly as it does when read on its own. Because the width test is applied
    to the *merged* span, that doomed block stays solo and takes no neighbour
    down with it — including one that falls inside its span.
    """
    partitions: dict[tuple[int, ModbusAddressType], list[ModbusAddress]] = {}
    for address in addresses:
        partitions.setdefault((address.device_id, address.type), []).append(address)

    blocks: list[ModbusBlock] = []
    for (device_id, address_type), group in partitions.items():
        group.sort(key=lambda address: (address.instance, address.count))
        first, *rest = group
        start, end = first.instance, _span_end(first)
        members = [first]
        for address in rest:
            address_end = _span_end(address)
            merged_end = max(end, address_end)
            if (
                address.instance - end - 1 <= max_gap
                and merged_end - start + 1 <= max_block
            ):
                end = merged_end
                members.append(address)
                continue
            blocks.append(_build(address_type, device_id, start, end, members))
            start, end = address.instance, address_end
            members = [address]
        blocks.append(_build(address_type, device_id, start, end, members))
    return blocks
