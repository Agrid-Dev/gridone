"""The dashboard envelope models: what they accept at the boundary."""

from __future__ import annotations

import pytest
from dashboards.models import DASHBOARD_ICONS, DashboardCreate, DashboardPatch
from pydantic import ValidationError


def test_icon_vocabulary_is_closed_and_kebab_cased():
    assert len(DASHBOARD_ICONS) == len(set(DASHBOARD_ICONS))
    assert all(icon == icon.lower() and " " not in icon for icon in DASHBOARD_ICONS)


@pytest.mark.parametrize("model", [DashboardCreate, DashboardPatch])
def test_icon_accepts_the_vocabulary_and_none(model):
    assert model(name="Ops", icon="thermometer").icon == "thermometer"
    assert model(name="Ops", icon=None).icon is None
    assert model(name="Ops").icon is None


@pytest.mark.parametrize("model", [DashboardCreate, DashboardPatch])
def test_icon_rejects_an_unknown_key_at_the_field(model):
    with pytest.raises(ValidationError) as excinfo:
        model(name="Ops", icon="unicorn")

    assert [e["loc"] for e in excinfo.value.errors()] == [("icon",)]
