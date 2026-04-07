"""Map between xknx APCI payloads and wire values for value adapters.

``bool`` / ``int`` / ``list[int]`` match what a future ``knx_dpt`` adapter will
produce on encode and consume on decode. No DPT interpretation here.
"""

from xknx.dpt import DPTArray, DPTBinary
from xknx.telegram.apci import GroupValueResponse, GroupValueWrite

from devices_manager.types import AttributeValueType


def apci_payload_to_raw(
    apci: GroupValueResponse | GroupValueWrite,
) -> bool | int | list[int]:
    value = apci.value
    if isinstance(value, DPTBinary):
        return bool(value.value)
    if isinstance(value, DPTArray):
        return list(value.value)
    msg = f"Unsupported KNX APCI payload type: {type(value).__name__}"
    raise TypeError(msg)


def raw_to_group_value_write(value: AttributeValueType) -> GroupValueWrite:
    """Build ``GroupValueWrite`` from adapter-encoded wire value."""
    if isinstance(value, bool):
        return GroupValueWrite(DPTBinary(int(value)))
    if isinstance(value, int):
        return GroupValueWrite(DPTArray((value,)))
    if isinstance(value, list):
        return GroupValueWrite(DPTArray(tuple(int(x) for x in value)))
    msg = (
        "KNX write expects bool, int (0-255), or list[int] octets "
        "(from value adapter encode); "
        f"got {type(value).__name__}"
    )
    raise TypeError(msg)
