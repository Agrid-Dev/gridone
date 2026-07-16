import pytest

from devices_manager.core.transports.modbus_tcp_transport.block_plan import (
    plan_blocks,
)
from devices_manager.core.transports.modbus_tcp_transport.modbus_address import (
    ModbusAddress,
    ModbusAddressType,
)
from devices_manager.core.transports.modbus_tcp_transport.transport_config import (
    MODBUS_MAX_REGISTERS_PER_READ,
)

HR = ModbusAddressType.HOLDING_REGISTER
IR = ModbusAddressType.INPUT_REGISTER
COIL = ModbusAddressType.COIL
DI = ModbusAddressType.DISCRETE_INPUT

# Wide enough never to force a split, except where a test sets it deliberately.
MAX_BLOCK = MODBUS_MAX_REGISTERS_PER_READ


def addr(
    instance: int,
    count: int = 1,
    address_type: ModbusAddressType = HR,
    device_id: int = 1,
) -> ModbusAddress:
    return ModbusAddress(
        type=address_type, instance=instance, device_id=device_id, count=count
    )


def ranges(blocks: list) -> list[tuple[int, int]]:
    return [(b.start, b.count) for b in blocks]


class TestPlanBlocks:
    @pytest.mark.parametrize(
        ("addresses", "max_gap", "expected"),
        [
            pytest.param([addr(10)], 0, [(10, 1)], id="single"),
            pytest.param(
                [addr(10), addr(11), addr(12)], 0, [(10, 3)], id="contiguous_singles"
            ),
            pytest.param(
                [addr(10, 2), addr(12, 2)], 0, [(10, 4)], id="contiguous_multi_count"
            ),
            pytest.param(
                [addr(10), addr(12)], 0, [(10, 1), (12, 1)], id="gap_not_bridged"
            ),
            pytest.param([addr(10), addr(12)], 1, [(10, 3)], id="gap_bridged"),
            pytest.param([addr(10), addr(14)], 3, [(10, 5)], id="gap_equals_max_gap"),
            pytest.param(
                [addr(10), addr(15)], 3, [(10, 1), (15, 1)], id="gap_over_max_gap"
            ),
            pytest.param(
                [addr(12), addr(10), addr(11)], 0, [(10, 3)], id="unsorted_input"
            ),
            pytest.param([addr(10), addr(10)], 0, [(10, 1)], id="duplicates_collapse"),
            pytest.param([addr(10, 3), addr(11, 1)], 0, [(10, 3)], id="overlapping"),
            pytest.param(
                [addr(10), addr(12), addr(30)],
                2,
                [(10, 3), (30, 1)],
                id="gap_bridged_then_broken",
            ),
        ],
    )
    def test_coalescing(
        self,
        addresses: list[ModbusAddress],
        max_gap: int,
        expected: list[tuple[int, int]],
    ) -> None:
        blocks = plan_blocks(addresses, max_block=MAX_BLOCK, max_gap=max_gap)
        assert ranges(blocks) == expected

    def test_empty_input_yields_no_blocks(self) -> None:
        assert plan_blocks([], max_block=MAX_BLOCK, max_gap=0) == []

    def test_every_address_is_a_member_of_exactly_one_block(self) -> None:
        addresses = [addr(10), addr(11), addr(50), addr(51, 2)]
        blocks = plan_blocks(addresses, max_block=MAX_BLOCK, max_gap=0)
        members = [a for block in blocks for a in block.addresses]
        assert sorted(members, key=lambda a: a.instance) == sorted(
            addresses, key=lambda a: a.instance
        )

    def test_block_covers_every_member_span(self) -> None:
        addresses = [addr(10), addr(12, 4), addr(20)]
        for block in plan_blocks(addresses, max_block=MAX_BLOCK, max_gap=8):
            block_end = block.start + block.count - 1
            for member in block.addresses:
                assert member.instance >= block.start
                assert member.instance + member.count - 1 <= block_end


class TestMaxBlock:
    def test_split_at_max_block(self) -> None:
        addresses = [addr(i) for i in range(10, 20)]
        blocks = plan_blocks(addresses, max_block=4, max_gap=0)
        assert ranges(blocks) == [(10, 4), (14, 4), (18, 2)]

    def test_span_may_not_exceed_max_block_when_merging(self) -> None:
        # 10..13 is 4 wide and fits; adding 14 would make it 5.
        addresses = [addr(10, 4), addr(14)]
        blocks = plan_blocks(addresses, max_block=4, max_gap=0)
        assert ranges(blocks) == [(10, 4), (14, 1)]

    def test_address_wider_than_max_block_gets_oversized_solo_block(self) -> None:
        """A block must never split within one address's span, so an address
        whose own count exceeds max_block is left intact to fail at the device."""
        blocks = plan_blocks([addr(10, 200)], max_block=MAX_BLOCK, max_gap=0)
        assert ranges(blocks) == [(10, 200)]

    def test_oversized_address_does_not_absorb_a_following_neighbour(self) -> None:
        blocks = plan_blocks([addr(10, 200), addr(210)], max_block=MAX_BLOCK, max_gap=0)
        assert ranges(blocks) == [(10, 200), (210, 1)]

    def test_oversized_address_does_not_absorb_a_contained_neighbour(self) -> None:
        """The oversized block is doomed to be rejected by the device, so an
        address sitting inside its span must not be dragged down with it."""
        blocks = plan_blocks([addr(10, 200), addr(11)], max_block=MAX_BLOCK, max_gap=0)
        assert ranges(blocks) == [(10, 200), (11, 1)]

    def test_merged_span_never_exceeds_max_block(self) -> None:
        addresses = [addr(10, 200), addr(11), addr(12, 2), addr(300)]
        for block in plan_blocks(addresses, max_block=MAX_BLOCK, max_gap=0):
            assert block.count <= MAX_BLOCK or len(block.addresses) == 1


class TestPartitioning:
    def test_address_types_never_share_a_block(self) -> None:
        addresses = [addr(10, address_type=HR), addr(11, address_type=IR)]
        blocks = plan_blocks(addresses, max_block=MAX_BLOCK, max_gap=8)
        assert {(b.type, b.start, b.count) for b in blocks} == {
            (HR, 10, 1),
            (IR, 11, 1),
        }

    def test_device_ids_never_share_a_block(self) -> None:
        addresses = [addr(10, device_id=1), addr(11, device_id=2)]
        blocks = plan_blocks(addresses, max_block=MAX_BLOCK, max_gap=8)
        assert {(b.device_id, b.start, b.count) for b in blocks} == {
            (1, 10, 1),
            (2, 11, 1),
        }

    @pytest.mark.parametrize("address_type", [COIL, DI])
    def test_bit_types_coalesce_like_registers(
        self, address_type: ModbusAddressType
    ) -> None:
        addresses = [addr(i, address_type=address_type) for i in (10, 11, 12)]
        blocks = plan_blocks(addresses, max_block=MAX_BLOCK, max_gap=0)
        assert ranges(blocks) == [(10, 3)]
        assert blocks[0].type == address_type

    def test_all_four_types_partition_independently(self) -> None:
        addresses = [addr(10, address_type=t) for t in (HR, IR, COIL, DI)]
        blocks = plan_blocks(addresses, max_block=MAX_BLOCK, max_gap=8)
        assert len(blocks) == 4
        assert {b.type for b in blocks} == {HR, IR, COIL, DI}


class TestExtract:
    def test_single_register_returns_bare_int(self) -> None:
        address = addr(11)
        block = plan_blocks([addr(10), address], max_block=MAX_BLOCK, max_gap=0)[0]
        assert block.extract(address, [100, 101]) == 101

    def test_multi_register_returns_list(self) -> None:
        address = addr(11, 2)
        block = plan_blocks([addr(10), address], max_block=MAX_BLOCK, max_gap=0)[0]
        assert block.extract(address, [100, 101, 102]) == [101, 102]

    def test_multi_register_of_count_one_still_bare(self) -> None:
        address = addr(10, 1)
        block = plan_blocks([address], max_block=MAX_BLOCK, max_gap=0)[0]
        assert block.extract(address, [7]) == 7

    @pytest.mark.parametrize("address_type", [COIL, DI])
    def test_bit_returns_bool_at_offset(self, address_type: ModbusAddressType) -> None:
        address = addr(12, address_type=address_type)
        block = plan_blocks(
            [addr(10, address_type=address_type), address],
            max_block=MAX_BLOCK,
            max_gap=8,
        )[0]
        assert block.extract(address, [False, True, True]) is True

    def test_short_payload_raises_instead_of_truncating(self) -> None:
        """A truncated slice would feed a codec fewer registers than its type
        needs, decoding silently to garbage rather than failing the read."""
        address = addr(11, 2)
        block = plan_blocks([addr(10), address], max_block=MAX_BLOCK, max_gap=0)[0]
        with pytest.raises(ValueError, match="too short"):
            block.extract(address, [100, 101])

    def test_extract_across_a_bridged_gap(self) -> None:
        address = addr(14)
        block = plan_blocks([addr(10), address], max_block=MAX_BLOCK, max_gap=8)[0]
        # 10..14 requested; the 11..13 hole is read and discarded.
        assert block.extract(address, [100, 0, 0, 0, 104]) == 104
