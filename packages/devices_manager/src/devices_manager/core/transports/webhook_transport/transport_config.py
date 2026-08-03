from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, model_validator

from devices_manager.core.transports.base_transport_config import BaseTransportConfig

WebhookAuthScheme = Literal["none", "bearer", "hmac_sha256"]


class WebhookTransportConfig(BaseTransportConfig):
    model_config = ConfigDict(extra="forbid", revalidate_instances="always")
    # The ingress endpoint is outside the API's standard authorization flow
    # (device-level ingestion, like MQTT or BACnet credentials), so the
    # transport carries its own auth scheme and verifies each push itself.
    auth: WebhookAuthScheme = "bearer"
    secret: Annotated[str | None, Field(json_schema_extra={"secret": True})] = None

    @model_validator(mode="after")
    def _secret_required_unless_auth_disabled(self) -> Self:
        if self.auth != "none" and not self.secret:
            msg = "secret is required unless auth is 'none'"
            raise ValueError(msg)
        return self
