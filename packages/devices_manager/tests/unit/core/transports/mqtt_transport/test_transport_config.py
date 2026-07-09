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

    def test_client_cert_without_client_key_rejected(self) -> None:
        with pytest.raises(ValidationError, match="must be provided together"):
            MqttTransportConfig(host="test.broker", client_cert="cert-pem")

    def test_client_key_without_client_cert_rejected(self) -> None:
        with pytest.raises(ValidationError, match="must be provided together"):
            MqttTransportConfig(host="test.broker", client_key="key-pem")

    def test_neither_client_cert_nor_key_is_valid(self) -> None:
        MqttTransportConfig(host="test.broker")

    def test_both_client_cert_and_key_is_valid(self) -> None:
        MqttTransportConfig(
            host="test.broker", client_cert="cert-pem", client_key="key-pem"
        )

    def test_pem_fields_are_marked_multiline_in_schema(self) -> None:
        properties = MqttTransportConfig.model_json_schema()["properties"]
        for field in ("ca_cert", "client_cert", "client_key"):
            assert properties[field].get("multiline") is True

    def test_non_pem_fields_are_not_marked_multiline(self) -> None:
        properties = MqttTransportConfig.model_json_schema()["properties"]
        for field in ("host", "port", "tls", "username", "password"):
            assert "multiline" not in properties[field]

    def test_secret_field_names(self) -> None:
        assert MqttTransportConfig.secret_field_names() == {"client_key", "password"}

    def test_secret_flag_in_json_schema(self) -> None:
        props = MqttTransportConfig.model_json_schema()["properties"]
        assert props["client_key"].get("secret") is True
        assert props["password"].get("secret") is True
        assert "secret" not in props["ca_cert"]

    def test_secret_clear_triggers(self) -> None:
        assert MqttTransportConfig.secret_clear_triggers() == {
            "client_key": "client_cert"
        }
