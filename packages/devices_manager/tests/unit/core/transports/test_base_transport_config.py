from pydantic import Field

from devices_manager.core.transports.base_transport_config import BaseTransportConfig


class _ConfigWithSecrets(BaseTransportConfig):
    host: str
    token: str | None = Field(default=None, json_schema_extra={"secret": True})
    label: str | None = None


class TestSecretFieldNames:
    def test_returns_fields_marked_secret(self) -> None:
        assert _ConfigWithSecrets.secret_field_names() == {"token"}

    def test_empty_when_no_field_is_secret(self) -> None:
        class _PlainConfig(BaseTransportConfig):
            host: str

        assert _PlainConfig.secret_field_names() == set()
