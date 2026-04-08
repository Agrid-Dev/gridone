import pytest

from devices_manager.core.value_adapters.registry.knx_dpt_adapter import knx_dpt_adapter

# (dpt_id, wire_value, decoded_value) — used for decode, encode, and round-trip
CASES = [
    ("1.001", True, True),
    ("1.001", False, False),
    ("9.001", [0x0C, 0x65], 22.5),
    ("5.001", [51], 20),
    ("5.010", [3], 3),
    ("20.102", [0], 0),
    ("20.102", [1], 1),
]


@pytest.mark.parametrize(("dpt_id", "wire", "value"), CASES)
def test_decode(dpt_id: str, wire: bool | list[int], value: object) -> None:
    assert knx_dpt_adapter(dpt_id).decode(wire) == value


@pytest.mark.parametrize(("dpt_id", "wire", "value"), CASES)
def test_encode(dpt_id: str, wire: bool | list[int], value: object) -> None:
    assert knx_dpt_adapter(dpt_id).encode(value) == wire


@pytest.mark.parametrize(("dpt_id", "wire", "_"), CASES)
def test_round_trip(dpt_id: str, wire: bool | list[int], _: object) -> None:
    adapter = knx_dpt_adapter(dpt_id)
    assert adapter.encode(adapter.decode(wire)) == wire


@pytest.mark.parametrize("dpt_id", ["99.999", "invalid"])
def test_unknown_dpt_raises(dpt_id: str) -> None:
    with pytest.raises(ValueError, match="Unknown KNX DPT"):
        knx_dpt_adapter(dpt_id)
