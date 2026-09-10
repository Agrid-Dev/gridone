"""What this server understands of driver-defined presentations, in one place.

The API exposes these to authoring tools (ADR §5, "un endpoint de schéma
annonce les versions/capacités supportées"); the validator and the envelope
read them; nothing else hard-codes a version, a capability or a budget.
"""

from dataclasses import dataclass
from typing import Final

SUPPORTED_SCHEMA_VERSIONS: Final[frozenset[int]] = frozenset({1})
"""Major versions of the dialect this server validates and renders."""

SUPPORTED_CAPABILITIES: Final[frozenset[str]] = frozenset(
    {
        "layout/1",
        "controls/1",
        "measurements/1",
        "setpoint-table/1",
        "device-face/1",
        "glyph-text/1",
        "conditions/1",
    }
)
"""The frozen v1 vocabulary (annex B §2), as announced in a document's ``requires``."""


@dataclass(frozen=True)
class Budgets:
    """Server-defined limits on one presentation document (annex B §4).

    The envelope limits bound what is *stored* whatever the version; the
    others bound what a supported version may declare, so the renderer's
    own budgets (``conditions.ts``) are never the first line of defence.
    """

    max_document_depth: int = 64
    max_document_nodes: int = 50_000
    max_bindings: int = 300
    max_controls: int = 300
    max_nodes: int = 600
    """Page nodes and face layers together."""
    max_layout_depth: int = 8
    max_condition_depth: int = 8
    max_condition_operations: int = 1000


DOCUMENT_BUDGETS: Final[Budgets] = Budgets()
