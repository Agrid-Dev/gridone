"""The committed plate and a resolver that accepts it, shared by the unit and
integration suites."""

import json
from pathlib import Path

import pytest

from models.targets import (
    AttributeCoverage,
    AttributeTarget,
    DevicesFilter,
    ResolvedTarget,
)
from models.types import DataType

PLATE_PATH = Path(__file__).parents[3] / "docs" / "specs" / "synoptic" / "ecs-est.json"


@pytest.fixture
def ecs_est_raw() -> dict:
    """The plate as committed, straight off disk."""
    return json.loads(PLATE_PATH.read_text(encoding="utf-8"))


BOOL_SUFFIXES = ("_state", "_open", "_running", "_fault")
"""Attribute names the plate binds as bool; everything else reads as a float."""


class AcceptingResolver:
    """Resolves every target to the one device its filter names.

    The plate's device ids are placeholders, so a real resolver refuses it;
    this one lets the service tests exercise storage without a fleet.
    """

    async def resolve(
        self,
        target: AttributeTarget,
        *,
        writable: bool = False,  # noqa: ARG002
    ) -> ResolvedTarget:
        is_bool = target.attribute.endswith(BOOL_SUFFIXES)
        return ResolvedTarget(
            attribute=target.attribute,
            device_ids=(target.devices.ids or ["dev"])[:1],
            data_type=DataType.BOOL if is_bool else DataType.FLOAT,
            excluded_device_ids=[],
        )

    async def list_attribute_coverage(
        self,
        devices: DevicesFilter,  # noqa: ARG002
    ) -> list[AttributeCoverage]:
        return []


@pytest.fixture
def resolver() -> AcceptingResolver:
    return AcceptingResolver()
