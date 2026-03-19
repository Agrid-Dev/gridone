from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


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

    @property
    def health_url(self) -> str:
        return f"{self.api_url.rstrip('/')}/health"


__all__ = [
    "REQUIRED_CONFIG_FIELDS",
    "App",
    "AppStatus",
    "RegistrationRequest",
    "RegistrationRequestCreate",
    "RegistrationRequestStatus",
]
