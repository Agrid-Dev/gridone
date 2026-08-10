from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, computed_field, field_validator

from apps.manifest import AppCapabilities, parse_capabilities


class RegistrationRequestStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DISCARDED = "discarded"


# Required top-level keys in the YAML config for registration requests.
REQUIRED_CONFIG_FIELDS = {"name", "api_url", "description", "icon"}


class RegistrationRequest(BaseModel):
    id: str
    username: str
    hashed_password: str
    status: RegistrationRequestStatus = RegistrationRequestStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    # The app's manifest, in YAML. Named `config` on the wire, per the
    # registration contract apps are written against.
    config: str = ""

    @computed_field
    @property
    def capabilities(self) -> AppCapabilities:
        return parse_capabilities(self.config)


class RegistrationRequestCreate(BaseModel):
    username: str
    password: str
    config: str = ""


class AppStatus(StrEnum):
    REGISTERED = "registered"
    HEALTHY = "healthy"
    # The app is up but is missing its config: the health loop re-pushes the
    # stored one, if any.
    NEEDS_CONFIG = "needs_config"
    UNHEALTHY = "unhealthy"


class PushStatus(StrEnum):
    OK = "ok"
    PENDING = "pending"
    REJECTED = "rejected"


class App(BaseModel):
    id: str
    user_id: str
    name: str
    description: str
    api_url: str
    icon: str
    status: AppStatus = AppStatus.REGISTERED
    manifest: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    # Excluded from serialization: GET /apps and GET /apps/{id} are readable by
    # any authenticated user, but config may hold secrets. Reads go through
    # GET /apps/{id}/config instead, which is gated behind users:write.
    config: dict[str, Any] | None = Field(default=None, exclude=True)
    push_status: PushStatus | None = None
    # Derived, not persisted: an app is disabled by blocking its service
    # account, so the users service owns this state. The manager populates it
    # on every read; storage backends do not write it back.
    enabled: bool = True

    @field_validator("api_url")
    @classmethod
    def _normalize_api_url(cls, v: str) -> str:
        return v.rstrip("/")

    @computed_field
    @property
    def capabilities(self) -> AppCapabilities:
        return parse_capabilities(self.manifest)

    @computed_field
    @property
    def health_url(self) -> str:
        return f"{self.api_url}/health"

    @computed_field
    @property
    def enable_url(self) -> str:
        return f"{self.api_url}/enable"


__all__ = [
    "REQUIRED_CONFIG_FIELDS",
    "App",
    "AppCapabilities",
    "AppStatus",
    "PushStatus",
    "RegistrationRequest",
    "RegistrationRequestCreate",
    "RegistrationRequestStatus",
]
