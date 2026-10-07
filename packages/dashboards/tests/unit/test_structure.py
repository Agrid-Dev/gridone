"""The structure document: the nesting rules are the shape of the types."""

from __future__ import annotations

import pytest
from dashboards.structure import DashboardStructureUpdate, dashboard_ids
from pydantic import ValidationError

_DASHBOARD = {"kind": "dashboard", "id": "d"}
_GROUP = {"kind": "group", "label": "DHW", "dashboards": ["d1", "d2"]}
_SECTION = {"kind": "section", "label": "HVAC", "items": [_DASHBOARD, _GROUP]}


def test_document_accepts_the_three_depths_and_needs_no_node_ids():
    document = DashboardStructureUpdate.model_validate(
        {"items": [_SECTION, _GROUP, _DASHBOARD]}
    )

    assert dashboard_ids(document) == ["d", "d1", "d2", "d1", "d2", "d"]
    assert document.items[0].id is None


@pytest.mark.parametrize(
    "items",
    [
        pytest.param(
            [{"kind": "section", "label": "outer", "items": [_SECTION]}],
            id="section-in-section",
        ),
        pytest.param(
            [{"kind": "section", "label": "s", "items": [{**_GROUP, "items": []}]}],
            id="group-with-items",
        ),
        pytest.param(
            [{"kind": "group", "label": "g", "dashboards": [_DASHBOARD]}],
            id="group-of-nodes-not-ids",
        ),
        pytest.param([{"kind": "group", "dashboards": []}], id="group-without-label"),
        pytest.param([{"kind": "group", "label": "g", "icon": "nope"}], id="bad-icon"),
        pytest.param([{"kind": "folder", "label": "f"}], id="unknown-kind"),
        pytest.param([{"id": "d"}], id="missing-kind"),
        pytest.param([{**_DASHBOARD, "name": "x"}], id="extra-field"),
    ],
)
def test_document_rejects_shapes_outside_the_tree(items: list[dict]):
    with pytest.raises(ValidationError):
        DashboardStructureUpdate.model_validate({"items": items})
