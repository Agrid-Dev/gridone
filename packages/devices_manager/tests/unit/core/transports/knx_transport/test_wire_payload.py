import pytest
from xknx.dpt import DPTArray, DPTBinary
from xknx.telegram.apci import GroupValueResponse, GroupValueWrite

from devices_manager.core.transports.knx_transport.wire_payload import (
    apci_payload_to_raw,
    raw_to_group_value_write,
)
from devices_manager.types import AttributeValueType


@pytest.mark.parametrize(
    ("apci", "expected"),
    [
        (GroupValueResponse(DPTBinary(1)), True),
        (GroupValueResponse(DPTBinary(0)), False),
        (GroupValueResponse(DPTArray((42,))), [42]),
        (GroupValueResponse(DPTArray((0x0C, 0x65))), [12, 101]),
        (GroupValueWrite(DPTBinary(1)), True),
        (GroupValueWrite(DPTArray((7,))), [7]),
    ],
)
def test_apci_payload_to_raw(
    apci: GroupValueResponse | GroupValueWrite, expected: object
) -> None:
    assert apci_payload_to_raw(apci) == expected


@pytest.mark.parametrize(
    ("value", "expected_raw"),
    [
        (True, True),
        (False, False),
        (42, [42]),
        ([0x0C, 0x65], [12, 101]),
    ],
)
def test_raw_to_group_value_write_round_trip(
    value: AttributeValueType | list[int], expected_raw: object
) -> None:
    payload = raw_to_group_value_write(value)  # type: ignore[arg-type]
    assert isinstance(payload, GroupValueWrite)
    assert apci_payload_to_raw(payload) == expected_raw


def test_raw_to_group_value_write_invalid_type_raises() -> None:
    with pytest.raises(TypeError, match="KNX write expects"):
        raw_to_group_value_write("not_valid")
