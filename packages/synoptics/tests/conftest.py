"""The committed plates and a resolver that accepts them, shared by the unit
and integration suites."""

import pytest
from plates import PLATE_NAMES, read

from models.targets import (
    AttributeCoverage,
    AttributeTarget,
    DevicesFilter,
    ResolvedTarget,
)
from models.types import DataType
from synoptics.symbols import SymbolRegistry, build_default_registry


@pytest.fixture
def registry() -> SymbolRegistry:
    return build_default_registry()


@pytest.fixture(params=PLATE_NAMES)
def plate_raw(request: pytest.FixtureRequest) -> dict:
    """Each committed plate in turn."""
    return read(request.param)


@pytest.fixture
def ecs_est_raw() -> dict:
    return read("ecs-est")


@pytest.fixture
def ecs_ouest_raw() -> dict:
    return read("ecs-ouest")


BOOL_SUFFIXES = ("_state", "fault")
"""Attribute names the plate binds as bool (run states, fault flags); everything
else reads as a float."""


class AcceptingResolver:
    """Resolves every target to the one device its filter names.

    The plate names one instance's devices, which no test fleet has; this one
    lets the service tests exercise storage without that fleet.
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
