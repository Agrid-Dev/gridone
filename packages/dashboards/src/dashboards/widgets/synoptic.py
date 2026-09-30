from __future__ import annotations

from typing import Literal

from pydantic import Field

from dashboards.widgets.config import WidgetConfig


class SynopticWidgetConfig(WidgetConfig):
    """Read-only live view of a stored synoptic.

    The reference stays opaque to dashboards; the UI loads the document and
    its readings through the synoptics and devices APIs.
    """

    type: Literal["synoptic"] = "synoptic"
    synoptic_id: str = Field(min_length=1)
