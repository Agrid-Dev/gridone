"""Structured references from a stored presentation to driver attributes.

Only a supported version is understood well enough to be rewritten; an
opaque newer version is returned untouched (ADR §10: a rename updates the
structured references of a known version, never strings in labels).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .envelope import PresentationEnvelope

if TYPE_CHECKING:
    from .envelope import JsonObject


def _bindings_of(document: JsonObject) -> dict[str, JsonObject]:
    """The ``bindings`` entries shaped as objects, whatever else the document holds."""
    bindings = document.get("bindings")
    if not isinstance(bindings, dict):
        return {}
    return {
        binding_id: binding
        for binding_id, binding in bindings.items()
        if isinstance(binding, dict)
    }


def referenced_attributes(envelope: PresentationEnvelope) -> set[str]:
    """The attribute names a supported-version document binds; empty otherwise."""
    if not envelope.is_version_supported:
        return set()
    return {
        attribute
        for binding in _bindings_of(envelope.document).values()
        if isinstance(attribute := binding.get("attribute"), str)
    }


def rename_attribute(
    envelope: PresentationEnvelope, old_name: str, new_name: str
) -> PresentationEnvelope:
    """Copy of the envelope where every binding on ``old_name`` names ``new_name``.

    Works on the stored document rather than a validated model so a v1
    document that is currently unavailable (a binding whose attribute was
    deleted, say) still follows the rename of the attributes it does bind.
    """
    if not envelope.is_version_supported:
        return envelope
    document = envelope.document
    for binding in _bindings_of(document).values():
        if binding.get("attribute") == old_name:
            binding["attribute"] = new_name
    return PresentationEnvelope.model_validate(document)
