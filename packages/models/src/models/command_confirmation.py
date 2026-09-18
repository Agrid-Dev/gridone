"""Optional UI evidence attached to command history, never an authorization gate."""

from __future__ import annotations

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
