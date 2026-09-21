"""Optional UI evidence attached to command history, never an authorization gate."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 -- pydantic schema
from typing import TypedDict

from pydantic import BaseModel, ConfigDict

from models.attribute_metadata import LanguageTag, Text  # noqa: TC001 -- pydantic
from models.types import AttributeValueType  # noqa: TC001 -- pydantic


class UIConfirmationContext(BaseModel):
    """The server's snapshot of the action the UI presented and accepted.

    Target, requested value, authenticated user and server timestamp live on
    the enclosing unit command. Unknown previous values are explicitly identified.
    Messages are static driver text, never templates.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    message: Text
    language: LanguageTag
    previous_value: AttributeValueType | None
    previous_value_known: bool


class ProtectionConfirmation(BaseModel):
    """Server-issued evidence of the unknown protections a human acknowledged."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    binding: str
    protection_ids: list[str]
    actor_id: str
    confirmed_at: datetime


class ProtectionWriteOptions(TypedDict, total=False):
    protection_confirmation: ProtectionConfirmation


def protection_write_options(
    confirmation: ProtectionConfirmation | None,
) -> ProtectionWriteOptions:
    return {"protection_confirmation": confirmation} if confirmation is not None else {}


class ProtectionBatchOptions(TypedDict, total=False):
    protection_confirmations: dict[str, ProtectionConfirmation]


def protection_batch_options(
    confirmations: dict[str, ProtectionConfirmation] | None,
) -> ProtectionBatchOptions:
    return (
        {"protection_confirmations": confirmations} if confirmations is not None else {}
    )
