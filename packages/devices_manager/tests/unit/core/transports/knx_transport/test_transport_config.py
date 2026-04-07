import pytest
from pydantic import ValidationError

from devices_manager.core.transports.knx_transport import (
    KNXSecureCredentials,
    KNXTransportConfig,
)


class TestKNXTransportConfig:
    def test_defaults(self) -> None:
        cfg = KNXTransportConfig(gateway_ip="192.168.1.1")
        assert cfg.port == 3671
        assert cfg.tunneling_mode == "udp"
        assert cfg.secure_credentials is None

    def test_tcp_tunneling(self) -> None:
        cfg = KNXTransportConfig(gateway_ip="192.168.1.1", tunneling_mode="tcp")
        xc = cfg.to_xknx_connection_config()
        assert xc.gateway_ip == "192.168.1.1"

    def test_secure_credentials_builds_connection(self) -> None:
        cfg = KNXTransportConfig(
            gateway_ip="192.168.1.1",
            secure_credentials=KNXSecureCredentials(
                device_authentication_password="dev",
                user_password="usr",
                user_id=3,
            ),
        )
        xc = cfg.to_xknx_connection_config()
        assert xc.secure_config is not None
        assert xc.secure_config.user_id == 3

    def test_extra_field_rejected(self) -> None:
        with pytest.raises(ValidationError):
            KNXTransportConfig(gateway_ip="127.0.0.1", unknown_field="x")  # type: ignore[call-arg]
