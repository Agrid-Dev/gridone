"""The closed vocabulary of dashboard types.

Lives in its own module so both the document models and the widget registry
can import it: the registry declares which dashboard types each widget type
fits, and ``models`` already imports from ``widgets``, so declaring it there
would close an import cycle.
"""

from __future__ import annotations

from typing import Literal, get_args

# A ``live`` dashboard shows the present (device cache, live aggregates); a
# ``history`` dashboard reads timeseries over a viewing period the UI owns.
# Every widget type declares which of these it fits (see the widget registry).
DashboardType = Literal["live", "history"]
DASHBOARD_TYPES: tuple[DashboardType, ...] = get_args(DashboardType)
