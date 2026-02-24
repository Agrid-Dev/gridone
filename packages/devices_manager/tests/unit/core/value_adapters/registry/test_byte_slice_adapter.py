from devices_manager.core.value_adapters.factory import value_adapter_builders
from devices_manager.core.value_adapters.registry.byte_slice_adapter import (
    byte_slice_adapter,
)


def test_pass_through_bytes() -> None:
    assert byte_slice_adapter("1:3").decode(b"\x01\x02\x03\x04") == b"\x02\x03"


def test_pass_through_list() -> None:
    assert byte_slice_adapter("1:3").decode([10, 20, 30, 40]) == [20, 30]


def test_pass_through_string() -> None:
    assert byte_slice_adapter("1:4").decode("hello") == "ell"


def test_pass_through_dict_slice() -> None:
    assert byte_slice_adapter({"slice": "1:3"}).decode(b"\x01\x02\x03") == b"\x02\x03"


def test_factory_key_exists() -> None:
    assert "byte_slice" in value_adapter_builders


def test_factory_builds_adapter() -> None:
    assert value_adapter_builders["byte_slice"] is byte_slice_adapter
