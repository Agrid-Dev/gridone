import pytest
from pydantic import TypeAdapter, ValidationError

from devices_manager.core.transports.mbus_transport.transport_config import (
    MBUS_DEFAULT_BAUD_RATE,
    MBusRfc2217Config,
    MBusSerialConfig,
    MBusSocketConfig,
    MBusTransportConfig,
)

_adapter: TypeAdapter[MBusRfc2217Config | MBusSocketConfig | MBusSerialConfig] = (
    TypeAdapter(MBusTransportConfig)
)


class TestMBusRfc2217Config:
    def test_valid(self) -> None:
        cfg = MBusRfc2217Config(host="gw.local", port=4000)
        assert cfg.mode == "rfc2217"
        assert cfg.host == "gw.local"
        assert cfg.port == 4000
        assert cfg.baud_rate == MBUS_DEFAULT_BAUD_RATE

    def test_custom_baud_rate(self) -> None:
        cfg = MBusRfc2217Config(host="10.0.0.1", port=4000, baud_rate=9600)
        assert cfg.baud_rate == 9600

    def test_missing_host_rejected(self) -> None:
        with pytest.raises(ValidationError):
            MBusRfc2217Config(port=4000)  # type: ignore[call-arg]

    def test_missing_port_rejected(self) -> None:
        with pytest.raises(ValidationError):
            MBusRfc2217Config(host="gw.local")  # type: ignore[call-arg]


class TestMBusSocketConfig:
    def test_valid(self) -> None:
        cfg = MBusSocketConfig(host="10.0.0.1", port=4001)
        assert cfg.mode == "socket"
        assert cfg.host == "10.0.0.1"
        assert cfg.port == 4001

    def test_no_baud_rate_field(self) -> None:
        cfg = MBusSocketConfig(host="10.0.0.1", port=4001)
        assert not hasattr(cfg, "baud_rate")

    def test_missing_host_rejected(self) -> None:
        with pytest.raises(ValidationError):
            MBusSocketConfig(port=4001)  # type: ignore[call-arg]

    def test_missing_port_rejected(self) -> None:
        with pytest.raises(ValidationError):
            MBusSocketConfig(host="gw.local")  # type: ignore[call-arg]


class TestMBusSerialConfig:
    def test_valid(self) -> None:
        cfg = MBusSerialConfig(device="/dev/ttyUSB0")
        assert cfg.mode == "serial"
        assert cfg.device == "/dev/ttyUSB0"
        assert cfg.baud_rate == MBUS_DEFAULT_BAUD_RATE

    def test_missing_device_rejected(self) -> None:
        with pytest.raises(ValidationError):
            MBusSerialConfig()  # type: ignore[call-arg]

    def test_empty_device_rejected(self) -> None:
        with pytest.raises(ValidationError):
            MBusSerialConfig(device="")


class TestMBusTransportConfigUnion:
    @pytest.mark.parametrize(
        ("raw", "expected_type"),
        [
            ({"mode": "rfc2217", "host": "gw.local", "port": 4000}, MBusRfc2217Config),
            ({"mode": "socket", "host": "10.0.0.1", "port": 4001}, MBusSocketConfig),
            ({"mode": "serial", "device": "/dev/ttyUSB0"}, MBusSerialConfig),
        ],
    )
    def test_discriminates_by_mode(self, raw: dict, expected_type: type) -> None:
        cfg = _adapter.validate_python(raw)
        assert isinstance(cfg, expected_type)

    @pytest.mark.parametrize(
        "raw",
        [
            {"mode": "rfc2217", "port": 4000},  # missing host
            {"mode": "socket", "host": "gw.local"},  # missing port
            {"mode": "serial"},  # missing device
            {"mode": "unknown", "host": "x", "port": 1},  # invalid mode
            {},  # no mode
        ],
    )
    def test_invalid_inputs_rejected(self, raw: dict) -> None:
        with pytest.raises(ValidationError):
            _adapter.validate_python(raw)
