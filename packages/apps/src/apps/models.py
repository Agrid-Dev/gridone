from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, computed_field, field_validator


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
    config: str = ""


class RegistrationRequestCreate(BaseModel):
    username: str
    password: str
    config: str = ""


class AppStatus(StrEnum):
    REGISTERED = "registered"
    HEALTHY = "healthy"
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

    @field_validator("api_url")
    @classmethod
    def _normalize_api_url(cls, v: str) -> str:
        return v.rstrip("/")

    @computed_field
    @property
    def health_url(self) -> str:
        return f"{self.api_url}/health"

    @computed_field
    @property
    def enable_url(self) -> str:
        return f"{self.api_url}/enable"

    def with_status(self, new_status: AppStatus) -> "App":
        return self.model_copy(update={"status": new_status})


__all__ = [
    "REQUIRED_CONFIG_FIELDS",
    "App",
    "AppStatus",
    "PushStatus",
    "RegistrationRequest",
    "RegistrationRequestCreate",
    "RegistrationRequestStatus",
]
