from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class RegistrationRequestStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DISCARDED = "discarded"


class RegistrationRequestType(StrEnum):
    USER = "user"
    SERVICE_ACCOUNT = "service_account"


# Required top-level keys when type is SERVICE_ACCOUNT.
SERVICE_ACCOUNT_REQUIRED_FIELDS = {"name", "api_url"}


class RegistrationRequest(BaseModel):
    id: str
    username: str
    hashed_password: str
    type: RegistrationRequestType = RegistrationRequestType.USER
    status: RegistrationRequestStatus = RegistrationRequestStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    config: str = ""


class RegistrationRequestCreate(BaseModel):
    username: str
    password: str
    type: RegistrationRequestType = RegistrationRequestType.USER
    config: str = ""


__all__ = [
    "SERVICE_ACCOUNT_REQUIRED_FIELDS",
    "RegistrationRequest",
    "RegistrationRequestCreate",
    "RegistrationRequestStatus",
    "RegistrationRequestType",
]
