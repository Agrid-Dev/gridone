"""Request schemas for the ``/dashboards`` widget endpoints.

Dashboard-level create/update reuse the service models (``DashboardCreate`` /
``DashboardPatch``) directly. Only the widget bodies need an API-level schema:
the widget ``config`` is typed (not ``dict``) so FastAPI validates it at the
boundary — an invalid config yields a 422 with field-level error paths, and the
config schema surfaces in OpenAPI for the SDK / ``z.fromJSONSchema``.
"""

from __future__ import annotations

from typing import Any

from dashboards import TextWidgetConfig, WidgetPatch
from pydantic import BaseModel, ConfigDict

# The request-body type for a widget's ``config``. Today only the ``text`` type
# is registered; as widget types are added this becomes a discriminated union on
# ``type`` — mirroring the WidgetRegistry, which remains the source of truth for
# the schemas exposed by ``GET /dashboards/widget-schemas``.
WidgetConfigBody = TextWidgetConfig


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
