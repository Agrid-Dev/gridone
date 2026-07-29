import pytest
from pydantic import ValidationError

from devices_manager.core.transports.webhook_transport import WebhookTransportConfig


class TestWebhookTransportConfig:
    def test_defaults_to_bearer_auth(self) -> None:
        cfg = WebhookTransportConfig(secret="s3cret")
        assert cfg.auth == "bearer"
        assert cfg.secret == "s3cret"  # noqa: S105

    def test_secret_required_by_default(self) -> None:
        with pytest.raises(ValidationError, match="secret is required"):
            WebhookTransportConfig()

    def test_secret_required_for_hmac(self) -> None:
        with pytest.raises(ValidationError, match="secret is required"):
            WebhookTransportConfig(auth="hmac_sha256")

    def test_auth_none_needs_no_secret(self) -> None:
        cfg = WebhookTransportConfig(auth="none")
        assert cfg.secret is None

    def test_empty_secret_rejected(self) -> None:
        with pytest.raises(ValidationError, match="secret is required"):
            WebhookTransportConfig(auth="bearer", secret="")

    def test_unknown_auth_scheme_rejected(self) -> None:
        with pytest.raises(ValidationError):
            WebhookTransportConfig(auth="basic", secret="s3cret")  # type: ignore[arg-type]

    def test_extra_field_rejected(self) -> None:
        with pytest.raises(ValidationError):
            WebhookTransportConfig(auth="none", unknown_field="x")  # type: ignore[call-arg]
