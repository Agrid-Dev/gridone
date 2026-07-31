"""Request schemas for the ``/dashboards`` widget endpoints.

Dashboard-level create/update reuse the service models (``DashboardCreate`` /
``DashboardPatch``) directly. Only the widget bodies need an API-level schema:
the widget ``config`` is typed (not ``dict``) so FastAPI validates it at the
boundary — an invalid config yields a 422 with field-level error paths, and the
config schema surfaces in OpenAPI for the SDK / ``z.fromJSONSchema``.
"""

from __future__ import annotations

from typing import Annotated, Any

from dashboards import (
    ChartWidgetConfig,
    DeviceControlWidgetConfig,
    TextWidgetConfig,
    WidgetPatch,
)
from pydantic import BaseModel, ConfigDict, Field

# The request-body type for a widget's ``config``: a discriminated union on
# ``type``, mirroring the WidgetRegistry — which remains the source of truth for
# the schemas exposed by ``GET /dashboards/widget-schemas``. Discriminating here
# is what makes a bad config a 422 whose error path names the offending field
# rather than a wall of per-member union errors.
WidgetConfigBody = Annotated[
    TextWidgetConfig | ChartWidgetConfig | DeviceControlWidgetConfig,
    Field(discriminator="type"),
]


class WidgetCreateBody(BaseModel):
    """Request body for ``POST /dashboards/{id}/widgets``."""

    model_config = ConfigDict(extra="forbid")

    config: WidgetConfigBody
    title: str | None = None
    description: str | None = None


class WidgetUpdateBody(BaseModel):
    """Request body for ``PUT /dashboards/{id}/widgets/{widget_id}``.

    All fields optional. ``model_fields_set`` lets the service tell an omitted
    field from one explicitly set to ``null`` (e.g. clearing a description). A
    widget's ``type`` is immutable, so a ``config`` with a different ``type`` is
    rejected by the service.
    """

    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    description: str | None = None
    config: WidgetConfigBody | None = None

    def to_patch(self) -> WidgetPatch:
        diff: dict[str, Any] = {}
        if "title" in self.model_fields_set:
            diff["title"] = self.title
        if "description" in self.model_fields_set:
            diff["description"] = self.description
        if "config" in self.model_fields_set and self.config is not None:
            diff["config"] = self.config.model_dump()
        return WidgetPatch(**diff)
