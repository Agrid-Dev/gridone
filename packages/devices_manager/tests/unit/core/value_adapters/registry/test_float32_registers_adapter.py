import pytest
from devices_manager.core.value_adapters.registry.float32_registers_adapter import (
    float32_registers_adapter,
)


def test_float32_registers_decode_encode_roundtrip() -> None:
    adapter = float32_registers_adapter("")
    original = 21.5
    registers = adapter.encode(original)
    decoded = adapter.decode(registers)
    assert decoded == pytest.approx(original, rel=1e-6)


def test_float32_registers_invalid_length() -> None:
    adapter = float32_registers_adapter("")
    with pytest.raises(ValueError, match="expects exactly 2 registers"):
        adapter.decode([1])
