from __future__ import annotations

from typing import Literal

from pydantic import Field

from dashboards.widgets.config import WidgetConfig

SynopticProjection = Literal["isometric", "flat"]
"""How the widget draws the plate: in volume, or as the plan (every ``z`` at 0).

The same vocabulary as the synoptic document's own ``projection``, restated
here because dashboards keep the document opaque: the widget's choice is the
dashboard author's and never touches the stored plate.
"""


class SynopticWidgetConfig(WidgetConfig):
    """Read-only live view of a stored synoptic.

    The reference stays opaque to dashboards; the UI loads the document and
    its readings through the synoptics and devices APIs.
    """

    type: Literal["synoptic"] = "synoptic"
    synoptic_id: str = Field(min_length=1)
    projection: SynopticProjection = "isometric"
