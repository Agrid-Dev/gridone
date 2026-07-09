import pytest
from pydantic import ValidationError

from devices_manager.core.transports import TransportMetadata
from devices_manager.core.transports.mqtt_transport import (
    MqttTransportClient,
    MqttTransportConfig,
)
from models.errors import InvalidError


def _mqtt_client(**config: object) -> MqttTransportClient:
    return MqttTransportClient(
        TransportMetadata(id="mqtt-1", name="mqtt"),
        MqttTransportConfig(host="broker", port=1883, **config),  # type: ignore[arg-type]
    )


class TestUpdateConfig:
    def test_partial_patch_merges_and_preserves_untouched_fields(self) -> None:
        # Regression (AGR-901): a partial config patch (only `ca_cert`) must
        # merge onto the existing config, not be validated as a standalone
        # config — the required `host` is preserved rather than reported missing.
        client = _mqtt_client()

        client.update_config({"ca_cert": "cert"}, reconnect=False)

        assert client.config.ca_cert == "cert"
        assert client.config.host == "broker"
        assert client.config.port == 1883

    def test_partial_patch_is_validated_against_the_config_class(self) -> None:
        client = _mqtt_client()

        with pytest.raises(ValidationError):
            client.update_config({"port": "not-a-number"}, reconnect=False)

    def test_unknown_field_is_rejected(self) -> None:
        client = _mqtt_client()

        with pytest.raises(ValidationError):
            client.update_config({"nonsense": True}, reconnect=False)


class TestUpdateConfigSecrets:
    """Write-only rules: a secret is replaceable but never silently wiped."""

    def test_omitting_a_secret_preserves_the_stored_value(self) -> None:
        client = _mqtt_client(client_key="orig", client_cert="cert")

        client.update_config({"host": "new-broker"}, reconnect=False)

        assert client.config.client_key == "orig"
        assert client.config.host == "new-broker"

    def test_null_secret_preserves_the_stored_value(self) -> None:
        client = _mqtt_client(client_key="orig", client_cert="cert", password="pw")

        client.update_config({"client_key": None, "password": None}, reconnect=False)

        assert client.config.client_key == "orig"
        assert client.config.password == "pw"  # noqa: S105

    def test_non_empty_secret_replaces_the_stored_value(self) -> None:
        client = _mqtt_client(client_key="orig", client_cert="cert")

        client.update_config({"client_key": "rotated"}, reconnect=False)

        assert client.config.client_key == "rotated"

    def test_empty_string_secret_is_rejected(self) -> None:
        client = _mqtt_client(client_key="orig", client_cert="cert")

        with pytest.raises(InvalidError, match="empty"):
            client.update_config({"client_key": ""}, reconnect=False)

    def test_full_masked_config_echo_does_not_wipe_secrets(self) -> None:
        # A naive client re-submitting the whole masked config (secrets nulled)
        # must not clear them.
        client = _mqtt_client(client_key="orig", client_cert="cert", password="pw")

        client.update_config(
            {
                "host": "broker",
                "port": 1883,
                "client_cert": "cert",
                "client_key": None,
                "password": None,
            },
            reconnect=False,
        )

        assert client.config.client_key == "orig"
        assert client.config.password == "pw"  # noqa: S105
