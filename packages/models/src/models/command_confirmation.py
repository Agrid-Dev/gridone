"""Server-issued write consent and optional UI evidence retained in command history."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 -- pydantic schema

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

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


class WriteConsent(BaseModel):
    """Server-issued evidence of unknown policy requirements a human acknowledged."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    binding: str
    requirement_ids: list[str] = Field(
        validation_alias=AliasChoices("requirement_ids", "operating_rule_ids")
    )
    actor_id: str
    confirmed_at: datetime
