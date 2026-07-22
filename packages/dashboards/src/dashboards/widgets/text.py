from __future__ import annotations

from typing import Literal

from pydantic import Field

from dashboards.widgets.config import WidgetConfig

HEX_COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"
"""Matches a 6-digit hex color with a leading ``#`` (e.g. ``#1a2b3c``).

Rejects color names (``red``), short/3-digit forms (``#12``, ``#abc``), and a
missing ``#``. The pattern is attached to the ``color`` field so it surfaces in
the generated JSON Schema and UI forms inherit it via ``z.fromJSONSchema``.
"""


class TextWidgetConfig(WidgetConfig):
    """Placeholder widget: a block of text in a chosen color.

    Deliberately trivial — it exists so the union/registry/schema mechanics
    (including the hex-pattern constraint flowing into JSON Schema) ship and are
    testable before richer widget types arrive.
    """

    type: Literal["text"] = "text"
    text: str
    color: str = Field(pattern=HEX_COLOR_PATTERN)
