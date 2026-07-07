import pytest
from pydantic import ValidationError

from devices_manager.core.transports.mqtt_transport import MqttTransportConfig


class TestMqttTransportConfig:
    def test_defaults(self) -> None:
        cfg = MqttTransportConfig(host="test.broker")
        assert cfg.port == 1883
        assert cfg.tls is False
        assert cfg.ca_cert is None
        assert cfg.client_cert is None
        assert cfg.client_key is None
        assert cfg.username is None
        assert cfg.password is None

    def test_tls_config(self) -> None:
        cfg = MqttTransportConfig(
            host="test.broker",
            port=8883,
            tls=True,
            ca_cert="ca-pem",
            client_cert="cert-pem",
            client_key="key-pem",
            username="gridone",
            password="secret",
        )
        assert cfg.tls is True
        assert cfg.ca_cert == "ca-pem"
        assert cfg.username == "gridone"

    def test_extra_field_rejected(self) -> None:
        with pytest.raises(ValidationError):
            MqttTransportConfig(host="test.broker", unknown_field="x")  # type: ignore[call-arg]

    def test_secret_field_names(self) -> None:
        assert MqttTransportConfig.secret_field_names() == {"client_key", "password"}
