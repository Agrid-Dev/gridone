from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class RegistrationRequestStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DISCARDED = "discarded"


# Required top-level keys in the YAML config for registration requests.
REQUIRED_CONFIG_FIELDS = {"name", "api_url"}


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


__all__ = [
    "REQUIRED_CONFIG_FIELDS",
    "RegistrationRequest",
    "RegistrationRequestCreate",
    "RegistrationRequestStatus",
]
