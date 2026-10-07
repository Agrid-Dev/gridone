"""The dashboard envelope models: what they accept at the boundary."""

from __future__ import annotations

import pytest
from dashboards.models import DASHBOARD_ICONS, DashboardCreate, DashboardPatch
from dashboards.types import DASHBOARD_TYPES, DashboardType
from pydantic import ValidationError


def test_icon_vocabulary_is_closed_and_kebab_cased():
    assert len(DASHBOARD_ICONS) == len(set(DASHBOARD_ICONS))
    assert all(icon == icon.lower() and " " not in icon for icon in DASHBOARD_ICONS)


def _envelope(model: type, **kwargs: object) -> dict:
    """Keyword arguments valid for either envelope model: only the create
    body carries the (required) type."""
    if model is DashboardCreate:
        return {"type": "live", **kwargs}
    return kwargs


@pytest.mark.parametrize("model", [DashboardCreate, DashboardPatch])
def test_icon_accepts_the_vocabulary_and_none(model):
    assert (
        model(**_envelope(model, name="Ops", icon="thermometer")).icon == "thermometer"
    )
    assert model(**_envelope(model, name="Ops", icon=None)).icon is None
    assert model(**_envelope(model, name="Ops")).icon is None


@pytest.mark.parametrize("model", [DashboardCreate, DashboardPatch])
def test_icon_rejects_an_unknown_key_at_the_field(model):
    with pytest.raises(ValidationError) as excinfo:
        model(**_envelope(model, name="Ops", icon="unicorn"))

    assert [e["loc"] for e in excinfo.value.errors()] == [("icon",)]


def test_type_vocabulary_is_live_and_history():
    assert DASHBOARD_TYPES == ("live", "history")


@pytest.mark.parametrize("type_", DASHBOARD_TYPES)
def test_create_accepts_each_type(type_: DashboardType):
    assert DashboardCreate(type=type_, name="Ops").type == type_


def test_create_requires_a_type():
    # The type decides which widgets the dashboard may hold, so it is chosen
    # up front rather than defaulted.
    with pytest.raises(ValidationError) as excinfo:
        DashboardCreate(name="Ops")  # type: ignore[call-arg]

    assert [e["loc"] for e in excinfo.value.errors()] == [("type",)]


def test_create_rejects_an_unknown_type():
    with pytest.raises(ValidationError) as excinfo:
        DashboardCreate(type="snapshot", name="Ops")  # type: ignore[arg-type]

    assert [e["loc"] for e in excinfo.value.errors()] == [("type",)]


def test_patch_cannot_carry_a_type():
    # Immutable after creation: changing it would strand the widgets placed.
    with pytest.raises(ValidationError) as excinfo:
        DashboardPatch(type="history")  # type: ignore[call-arg]

    assert [e["loc"] for e in excinfo.value.errors()] == [("type",)]
