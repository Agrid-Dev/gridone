"""Public record of a stored entity skipped during service load."""

from typing import Literal

from pydantic import BaseModel

LoadEntityKind = Literal["transport", "driver", "device"]


class LoadError(BaseModel):
    """A stored entity that could not be loaded and was skipped.

    Surfaced through ``DevicesService.load_errors`` so a degraded boot is
    distinguishable from a clean one.
    """

    kind: LoadEntityKind
    entity_id: str
    reason: str
