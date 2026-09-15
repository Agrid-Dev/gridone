import pytest
from pydantic import ValidationError

from device_views.models import DeviceViewInput


@pytest.mark.parametrize(
    "body",
    [
        {"name": " ", "group_by": ["floor"]},
        {"name": "Building", "group_by": ["Floor", "floor"]},
        {"name": "Building", "group_by": ["floor:2"]},
        {"name": "Building", "group_by": ["floor"], "filter": {"ids": []}},
        {"name": "Building", "group_by": ["floor"], "device_ids": ["a"]},
    ],
)
def test_invalid_display_configuration(body):
    with pytest.raises(ValidationError):
        DeviceViewInput.model_validate(body)


def test_display_configuration_has_no_required_members_or_driver():
    view = DeviceViewInput(name=" Building ", group_by=["Étage", "pièce"])
    assert view.name == "Building"
    assert view.group_by == ["étage", "pièce"]
    assert view.filter.model_dump(exclude_none=True) == {}


def test_group_view_needs_no_subgroups():
    view = DeviceViewInput.model_validate(
        {
            "name": "Thermostats",
            "filter": {"tags": {"group": ["comfort"]}},
            "group_by": [],
        }
    )
    assert view.group_by == []
    assert view.filter.tags == {"group": ["comfort"]}
