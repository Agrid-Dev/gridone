"""What a presentation resolves to: a validated document, or why not.

Diagnostics are Gridone codes and field paths, never raw exception text
(ADR §5): an authoring tool points at the field, a reader maps the code.
"""

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict

from .models import PresentationV1


class DiagnosticCode(StrEnum):
    UNSUPPORTED_VERSION = "unsupported_version"
    UNSUPPORTED_CAPABILITY = "unsupported_capability"
    INVALID_DOCUMENT = "invalid_document"
    MISSING_BINDING = "missing_binding"
    MISSING_ATTRIBUTE = "missing_attribute"
    MISSING_CONTROL = "missing_control"
    MISSING_ASSET = "missing_asset"
    UNDECLARED_FILE = "undeclared_file"
    """A package file no asset declares (import only)."""
    MISSING_GLYPH_SET = "missing_glyph_set"
    MISSING_LAYER_REF = "missing_layer_ref"
    TYPE_MISMATCH = "type_mismatch"
    BUDGET_EXCEEDED = "budget_exceeded"
    INVALID_ACTION = "invalid_action"


class PresentationDiagnostic(BaseModel):
    """One reason a presentation is unavailable, located by a JSON pointer."""

    model_config = ConfigDict(frozen=True)

    code: DiagnosticCode
    path: str | None = None
    """JSON pointer into the document (``/page/items/1/content/layers/3``)."""
    message: str


class AvailablePresentation(BaseModel):
    status: Literal["available"] = "available"
    document: PresentationV1


class UnavailablePresentation(BaseModel):
    status: Literal["unavailable"] = "unavailable"
    diagnostics: list[PresentationDiagnostic]


PresentationStatus = AvailablePresentation | UnavailablePresentation
"""The outcome of ``validate_presentation``, discriminated on ``status``."""
