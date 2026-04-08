import pytest

from devices_manager.core.value_adapters.registry.knx_dpt_adapter import knx_dpt_adapter

# decode


@pytest.mark.parametrize(
    ("dpt_id", "wire_in", "expected"),
    [
        ("1.001", True, True),
        ("1.001", False, False),
        ("9.001", [0x0C, 0x65], 22.5),  # DPTTemperature
        ("5.001", [51], 20),  # DPTScaling: byte 51 → 20 %
        ("5.010", [3], 3),  # DPTValue1Ucount: 1-byte unsigned passthrough
        ("20.102", [0], 0),  # DPTHVACMode AUTO → enum.value = 0
        ("20.102", [1], 1),  # DPTHVACMode COMFORT → enum.value = 1
    ],
)
def test_decode(dpt_id: str, wire_in: bool | list[int], expected: object) -> None:
    assert knx_dpt_adapter(dpt_id).decode(wire_in) == expected


# encode


@pytest.mark.parametrize(
    ("dpt_id", "value", "expected_wire"),
    [
        ("1.001", True, True),
        ("1.001", False, False),
        ("9.001", 22.5, [0x0C, 0x65]),
        ("5.001", 20, [51]),
        ("5.010", 3, [3]),
        ("20.102", "Auto", [0]),  # xknx accepts string name for enum DPTs
        ("20.102", "Comfort", [1]),
    ],
)
def test_encode(dpt_id: str, value: object, expected_wire: bool | list[int]) -> None:
    assert knx_dpt_adapter(dpt_id).encode(value) == expected_wire


# round-trip


@pytest.mark.parametrize(
    ("dpt_id", "wire_in"),
    [
        ("1.001", True),
        ("1.001", False),
        ("9.001", [0x0C, 0x65]),
        ("5.010", [2]),
    ],
)
def test_round_trip(dpt_id: str, wire_in: bool | list[int]) -> None:
    adapter = knx_dpt_adapter(dpt_id)
    assert adapter.encode(adapter.decode(wire_in)) == wire_in


# error cases


def test_unknown_dpt_raises() -> None:
    with pytest.raises(ValueError, match=r"Unknown KNX DPT.*99\.999"):
        knx_dpt_adapter("99.999")


def test_unrecognised_string_raises() -> None:
    with pytest.raises(ValueError, match="Unknown KNX DPT"):
        knx_dpt_adapter("invalid")
