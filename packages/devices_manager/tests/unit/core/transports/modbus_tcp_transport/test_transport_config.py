import pytest
from pydantic import ValidationError

from devices_manager.core.transports.modbus_tcp_transport import (
    ModbusTCPTransportConfig,
)
from devices_manager.core.transports.modbus_tcp_transport.transport_config import (
    DEFAULT_MAX_BLOCK,
    DEFAULT_MAX_GAP,
    MODBUS_MAX_REGISTERS_PER_READ,
)


class TestBlockConfig:
    def test_defaults_are_applied(self) -> None:
        config = ModbusTCPTransportConfig(host="plc.local")
        assert config.max_block == DEFAULT_MAX_BLOCK
        assert config.max_gap == DEFAULT_MAX_GAP

    @pytest.mark.parametrize(
        "max_block",
        [
            pytest.param(MODBUS_MAX_REGISTERS_PER_READ + 1, id="over_protocol_limit"),
            pytest.param(0, id="zero"),
            pytest.param(-1, id="negative"),
        ],
    )
    def test_out_of_range_max_block_is_rejected(self, max_block: int) -> None:
        with pytest.raises(ValidationError):
            ModbusTCPTransportConfig(host="plc.local", max_block=max_block)

    def test_negative_max_gap_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            ModbusTCPTransportConfig(host="plc.local", max_gap=-1)

    def test_protocol_limit_is_accepted(self) -> None:
        config = ModbusTCPTransportConfig(
            host="plc.local", max_block=MODBUS_MAX_REGISTERS_PER_READ
        )
        assert config.max_block == MODBUS_MAX_REGISTERS_PER_READ
