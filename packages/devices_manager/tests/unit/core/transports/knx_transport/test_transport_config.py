from typing import Any

import pytest
from pydantic import ValidationError
from xknx.io import ConnectionType

from devices_manager.core.transports.knx_transport import KNXTransportConfig


class TestKNXTransportConfig:
    def test_defaults(self) -> None:
        cfg = KNXTransportConfig(gateway_ip="192.168.1.1")
        assert cfg.port == 3671
        assert cfg.tunneling_mode == "udp"
        assert cfg.secure_device_authentication_password is None
        assert cfg.secure_user_password is None
        assert cfg.secure_user_id == 2

    def test_tcp_tunneling(self) -> None:
        cfg = KNXTransportConfig(gateway_ip="192.168.1.1", tunneling_mode="tcp")
        xc = cfg.to_xknx_connection_config()
        assert xc.gateway_ip == "192.168.1.1"
        assert xc.connection_type is ConnectionType.TUNNELING_TCP
        assert xc.secure_config is None

    def test_no_secure_config_without_passwords(self) -> None:
        cfg = KNXTransportConfig(gateway_ip="192.168.1.1")
        xc = cfg.to_xknx_connection_config()
        assert xc.connection_type is ConnectionType.TUNNELING
        assert xc.secure_config is None

    def test_secure_passwords_build_a_secure_connection(self) -> None:
        cfg = KNXTransportConfig(
            gateway_ip="192.168.1.1",
            secure_device_authentication_password="dev",
            secure_user_password="usr",
            secure_user_id=3,
        )
        xc = cfg.to_xknx_connection_config()
        assert xc.connection_type is ConnectionType.TUNNELING_TCP_SECURE
        assert xc.secure_config is not None
        assert xc.secure_config.device_authentication_password == "dev"  # noqa: S105
        assert xc.secure_config.user_password == "usr"  # noqa: S105
        assert xc.secure_config.user_id == 3

    def test_secure_overrides_tunneling_mode(self) -> None:
        cfg = KNXTransportConfig(
            gateway_ip="192.168.1.1",
            tunneling_mode="udp",
            secure_device_authentication_password="dev",
            secure_user_password="usr",
        )
        xc = cfg.to_xknx_connection_config()
        assert xc.connection_type is ConnectionType.TUNNELING_TCP_SECURE

    @pytest.mark.parametrize(
        "kwargs",
        [
            pytest.param(
                {"secure_device_authentication_password": "dev"},
                id="device_password_alone",
            ),
            pytest.param({"secure_user_password": "usr"}, id="user_password_alone"),
        ],
    )
    def test_one_secure_password_without_the_other_is_rejected(
        self, kwargs: dict[str, Any]
    ) -> None:
        with pytest.raises(ValidationError, match="must be set together"):
            KNXTransportConfig(gateway_ip="192.168.1.1", **kwargs)

    def test_blank_passwords_normalize_to_absent_and_stay_plain(self) -> None:
        # A cleared form input arrives as "" — it must NOT enable IP-Secure
        # with empty credentials (the handshake would fail at connect time).
        cfg = KNXTransportConfig(
            gateway_ip="192.168.1.1",
            secure_device_authentication_password="",
            secure_user_password="",
        )
        assert cfg.secure_device_authentication_password is None
        assert cfg.secure_user_password is None
        xc = cfg.to_xknx_connection_config()
        assert xc.connection_type is ConnectionType.TUNNELING
        assert xc.secure_config is None

    @pytest.mark.parametrize(
        "kwargs",
        [
            pytest.param(
                {
                    "secure_device_authentication_password": "",
                    "secure_user_password": "usr",
                },
                id="blank_device_password",
            ),
            pytest.param(
                {
                    "secure_device_authentication_password": "dev",
                    "secure_user_password": "",
                },
                id="blank_user_password",
            ),
        ],
    )
    def test_one_blank_password_still_fails_the_pair_rule(
        self, kwargs: dict[str, Any]
    ) -> None:
        # "" used to defeat the `is None` pair check, silently keeping a
        # half-configured IP-Secure setup.
        with pytest.raises(ValidationError, match="must be set together"):
            KNXTransportConfig(gateway_ip="192.168.1.1", **kwargs)

    def test_legacy_secure_credentials_key_rejected(self) -> None:
        # The pre-flattening nested shape: no consumer ever stored it, so it
        # now fails `extra="forbid"` instead of getting a migration.
        with pytest.raises(ValidationError):
            KNXTransportConfig(
                gateway_ip="192.168.1.1",
                secure_credentials={  # type: ignore[call-arg]
                    "device_authentication_password": "dev",
                    "user_password": "usr",
                },
            )

    def test_extra_field_rejected(self) -> None:
        with pytest.raises(ValidationError):
            KNXTransportConfig(gateway_ip="127.0.0.1", unknown_field="x")  # type: ignore[call-arg]
