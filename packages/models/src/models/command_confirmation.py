"""Optional UI evidence attached to command history, never an authorization gate."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from models.attribute_metadata import LanguageTag, Text  # noqa: TC001 -- pydantic
from models.types import AttributeValueType  # noqa: TC001 -- pydantic

REDACTED_VALUE = "••••"


class UIConfirmationContext(BaseModel):
    """The server's snapshot of the action the UI presented and accepted.

    Target, requested value, authenticated user and server timestamp live on
    the enclosing unit command. Unknown and redacted previous values are
    explicitly distinguished. Messages are static driver text, never templates.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    message: Text
    language: LanguageTag
    previous_value: AttributeValueType | None
    previous_value_known: bool
    value_redacted: bool = False


def redact_text(text: str, *values: AttributeValueType | None) -> str:
    """Mask known secret values if a driver author included them in static text."""
    for secret in sorted(
        {str(value) for value in values if value is not None and str(value)},
        key=len,
        reverse=True,
    ):
        text = str(text).replace(str(secret), REDACTED_VALUE)
    return text
