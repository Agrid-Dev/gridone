"""Save-time rules: one case per rule, each breaking exactly one thing.

Every case asserts the error *type* rather than its message, so rewording a
message never breaks the suite while the rule itself stays pinned.
"""

import copy
import time

import pytest

from models.errors import InvalidError, SchemaValidationError
from models.targets import (
    AttributeCoverage,
    AttributeTarget,
    DevicesFilter,
    ResolvedTarget,
)
from models.types import DataType
from synoptics.models import MAX_BOUND_SLOTS, Cell, SynopticDocument
from synoptics.symbols import (
    Footprint,
    SymbolRegistry,
    SymbolType,
    build_default_registry,
)
from synoptics.validation import (
    Violation,
    bound_slots,
    validate_document,
    validate_for_save,
)


@pytest.fixture
def registry():
    return build_default_registry()


def check(raw, registry):
    """Validate a raw document, returning the error types it raised."""
    document = SynopticDocument.model_validate(raw)
    try:
        validate_document(document, registry)
    except SchemaValidationError as exc:
        return [item.type for item in exc.errors]
    return []


def test_the_base_document_is_valid(document, registry):
    assert check(document, registry) == []


def test_every_error_type_is_a_member_of_the_vocabulary(document, registry):
    """The editor branches on ``type``, so a code that is not in ``Violation``
    is a contract break even if the message reads fine."""
    document["labels"].append(dict(document["labels"][0]))
    document["symbols"][0]["bindings"]["pressure"] = {"kind": "text", "text": "3 bar"}
    for type_ in check(document, registry):
        assert type_ in set(Violation)


# ----------------------------------------------------------------------
# Ids
# ----------------------------------------------------------------------


def test_ids_are_unique_across_the_whole_document(document, registry):
    """Symbols, pipes, tags and labels share one namespace."""
    document["labels"].append(dict(document["labels"][0]))
    assert check(document, registry) == ["duplicate_id"]


def test_a_label_may_not_reuse_a_pipe_id(document, registry):
    document["labels"][0]["id"] = "supply"
    assert "duplicate_id" in check(document, registry)


def test_a_tag_may_not_reuse_a_symbol_id(document, registry):
    document["pipes"][0]["tags"][0]["id"] = "pac-01"
    assert "duplicate_id" in check(document, registry)


def test_a_duplicated_element_is_not_resolved_against(document, registry):
    """With two symbols of one id there is no answer to which one a pipe
    attaches to, so the pass must stop rather than pick an arbitrary winner and
    report a phantom missing port on top of the real duplicate."""
    twin = copy.deepcopy(document["symbols"][0])
    twin["type"] = "tank"
    twin["props"] = {"capacity": "500 L"}
    twin["bindings"] = {}
    document["symbols"].append(twin)
    found = check(document, registry)
    assert "duplicate_id" in found
    assert "unknown_port" not in found


def test_a_duplicated_inline_symbol_is_reported_once(document, registry):
    """The inline pass skips duplicates like every other pass: a placement
    error on an element already rejected sends the author chasing two bugs."""
    twin = copy.deepcopy(document["symbols"][1])
    twin["placement"]["cell"] = {"x": 9, "y": 9}
    document["symbols"].append(twin)
    assert check(document, registry) == ["duplicate_id"]


@pytest.mark.parametrize("bad_id", ["PAC-01", "-pac", "pac 01", "", "p" * 65])
def test_ids_must_be_slugs(document, bad_id):
    document["symbols"][0]["id"] = bad_id
    with pytest.raises(ValueError, match="validation error"):
        SynopticDocument.model_validate(document)


# ----------------------------------------------------------------------
# Symbols and their types
# ----------------------------------------------------------------------


def test_the_symbol_type_must_be_registered(document, registry):
    document["symbols"][0]["type"] = "reactor"
    assert "unknown_symbol_type" in check(document, registry)


def test_props_are_validated_against_the_type(document, registry):
    document["symbols"][0]["type"] = "tank"
    document["symbols"][0]["props"] = {"capacity": 500}
    assert "invalid_props" in check(document, registry)


def test_a_binding_names_a_slot_the_type_declares(document, registry):
    document["symbols"][0]["bindings"]["pressure"] = {
        "kind": "text",
        "text": "3 bar",
    }
    assert check(document, registry) == ["unknown_slot"]


def test_a_required_slot_must_be_bound(document, registry):
    """No shipped type requires a slot in v1, so the rule is pinned against a
    type registered here rather than a real one."""
    registry.register(
        SymbolType(
            type="meter",
            footprint=Footprint(w=1, d=1),
            slots=("energy",),
            required_slots=frozenset({"energy"}),
        )
    )
    document["symbols"].append(
        {
            "id": "ft-01",
            "type": "meter",
            "placement": {"kind": "cell", "cell": {"x": 8, "y": 8}, "rotation": 0},
        }
    )
    assert check(document, registry) == ["missing_slot"]


def test_a_collector_may_not_be_rotated(document, registry):
    """``props.axis`` already says which way the bar runs; having both would
    let them disagree."""
    document["symbols"][0] = {
        "id": "coll-01",
        "type": "collector",
        "placement": {"kind": "cell", "cell": {"x": 0, "y": 0}, "rotation": 1},
        "props": {
            "axis": "y",
            "length": 4,
            "ports": {"out_1": {"offset": 0, "side": "+x"}},
        },
    }
    document["pipes"][0]["from"] = {
        "kind": "port",
        "symbol": "coll-01",
        "port": "out_1",
    }
    assert "rotation_locked" in check(document, registry)


def test_a_rotation_violation_does_not_fabricate_a_geometry_error(document, registry):
    """The pass must not go on to resolve ports through a rotation it has just
    rejected: the departure below is correct, and only the rotation is wrong."""
    document["symbols"][0] = {
        "id": "coll-01",
        "type": "collector",
        "placement": {"kind": "cell", "cell": {"x": 0, "y": 0}, "rotation": 1},
        "props": {
            "axis": "x",
            "length": 4,
            "ports": {"out_1": {"offset": 2, "side": "+y"}},
        },
    }
    document["symbols"] = [document["symbols"][0]]
    document["pipes"][0]["from"] = {
        "kind": "port",
        "symbol": "coll-01",
        "port": "out_1",
    }
    document["pipes"][0]["to"] = {"kind": "cell", "cell": {"x": 2, "y": 5}}
    document["pipes"][0]["tags"] = []
    found = check(document, registry)
    assert "rotation_locked" in found
    assert "diagonal_segment" not in found, "port resolved through a rejected rotation"


def test_a_collector_resolves_its_authored_ports(document, registry):
    document["symbols"][0] = {
        "id": "coll-01",
        "type": "collector",
        "placement": {"kind": "cell", "cell": {"x": 0, "y": 0}, "rotation": 0},
        "props": {
            "axis": "y",
            "length": 4,
            "ports": {"out_1": {"offset": 1, "side": "+x"}},
        },
    }
    document["pipes"][0]["from"] = {
        "kind": "port",
        "symbol": "coll-01",
        "port": "out_1",
    }
    document["pipes"][0]["to"] = {"kind": "cell", "cell": {"x": 5, "y": 1}}
    assert check(document, registry) == []


# ----------------------------------------------------------------------
# Pipe endpoints
# ----------------------------------------------------------------------


def test_a_port_endpoint_names_an_existing_symbol(document, registry):
    document["pipes"][0]["from"]["symbol"] = "pac-99"
    assert "unknown_symbol" in check(document, registry)


def test_a_broken_symbol_is_not_reported_as_a_missing_one(document, registry):
    document["symbols"][0]["type"] = "reactor"
    found = check(document, registry)
    assert "unusable_symbol" in found
    assert "unknown_symbol" not in found


def test_a_port_endpoint_names_a_port_the_type_declares(document, registry):
    document["pipes"][0]["from"]["port"] = "condenser"
    assert "unknown_port" in check(document, registry)


def test_a_run_leaves_a_port_through_its_declared_face(document, registry):
    """``pac-01.supply`` faces +x, so a run heading -x from it is an authoring
    error rather than a line drawn through the machine."""
    document["pipes"][0]["to"] = {"kind": "cell", "cell": {"x": -4, "y": 1}}
    document["symbols"][0 + 1]["placement"]["cell"] = {"x": -1, "y": 1}
    assert "port_side_mismatch" in check(document, registry)


# ----------------------------------------------------------------------
# Pipe geometry
# ----------------------------------------------------------------------


def test_a_document_has_a_cell_budget(document, registry):
    """The coordinate bound caps one segment, not how many a run has; a few
    corners bouncing across the grid must be refused before being expanded."""
    document["symbols"] = [document["symbols"][0]]
    document["pipes"][0]["tags"] = []
    document["pipes"][0]["to"] = {"kind": "cell", "cell": {"x": 10000, "y": 1}}
    document["pipes"][0]["waypoints"] = [
        {"x": 10000 if i % 2 == 0 else -10000, "y": 1} for i in range(6)
    ]
    assert check(document, registry) == ["polyline_budget_exceeded"]


def test_many_tags_on_a_long_run_stay_cheap(document, registry):
    """Membership against a run must not be a list scan: three thousand tags
    on a twenty-thousand-cell run took forty seconds that way. The ceiling is
    loose on purpose; it only has to sit far below that."""
    document["symbols"] = [document["symbols"][0]]
    document["pipes"][0]["to"] = {"kind": "cell", "cell": {"x": 10000, "y": 1}}
    document["pipes"][0]["tags"] = [
        {"id": f"t{i}", "at": {"x": 9999, "y": 1}, "label": "T"} for i in range(3000)
    ]
    started = time.perf_counter()
    assert check(document, registry) == []
    assert time.perf_counter() - started < 2


def test_a_port_carried_off_the_grid_is_an_error_not_a_crash(document, registry):
    """The placement is in bounds but the port offset is not: that is an
    authoring error like any other, reported with the rest."""
    document["symbols"] = [document["symbols"][0]]
    document["symbols"][0]["placement"]["cell"] = {"x": 10000, "y": 0}
    document["pipes"] = []
    assert check(document, registry) == ["port_off_grid"]


def test_segments_are_axis_aligned(document, registry):
    document["pipes"][0]["waypoints"] = [{"x": 3, "y": 4}]
    assert "diagonal_segment" in check(document, registry)


def test_a_run_of_zero_length_is_rejected(document, registry):
    """A run that starts and ends on the same cell moves along no axis, so the
    same pass refuses it: there is no separate length rule. It reports its own
    type, since "not axis-aligned" describes a repeated corner poorly."""
    document["symbols"] = [document["symbols"][0]]
    document["pipes"][0]["to"] = {"kind": "cell", "cell": {"x": 1, "y": 1}}
    document["pipes"][0]["tags"] = []
    found = check(document, registry)
    assert "zero_length_segment" in found
    assert "diagonal_segment" not in found


def test_a_tag_must_ride_its_pipe(document, registry):
    document["pipes"][0]["tags"][0]["at"] = {"x": 2, "y": 9}
    assert check(document, registry) == ["off_polyline"]


# ----------------------------------------------------------------------
# Tees
# ----------------------------------------------------------------------


def test_a_tee_lands_on_a_cell_of_the_other_run(document, registry):
    document["pipes"].append(
        {
            "id": "branch",
            "fluid": "primary_supply",
            "from": {"kind": "pipe", "pipe": "supply", "cell": {"x": 4, "y": 1}},
            "to": {"kind": "cell", "cell": {"x": 4, "y": 5}},
        }
    )
    assert check(document, registry) == []

    document["pipes"][1]["from"]["cell"] = {"x": 4, "y": 7}
    assert "off_polyline" in check(document, registry)


def test_a_tee_names_a_known_pipe(document, registry):
    document["pipes"].append(
        {
            "id": "branch",
            "fluid": "primary_supply",
            "from": {"kind": "pipe", "pipe": "nowhere", "cell": {"x": 4, "y": 1}},
            "to": {"kind": "cell", "cell": {"x": 4, "y": 5}},
        }
    )
    assert "unknown_pipe" in check(document, registry)


def test_a_pipe_may_not_tee_onto_itself(document, registry):
    document["pipes"][0]["to"] = {
        "kind": "pipe",
        "pipe": "supply",
        "cell": {"x": 5, "y": 1},
    }
    assert "self_reference" in check(document, registry)


def test_pipe_references_may_not_form_a_cycle(document, registry):
    """Chains are fine; a cycle has no branch point to draw from."""
    document["symbols"] = [document["symbols"][0]]
    document["pipes"] = [
        {
            "id": "a",
            "fluid": "dhw",
            "from": {"kind": "pipe", "pipe": "b", "cell": {"x": 0, "y": 4}},
            "to": {"kind": "cell", "cell": {"x": 4, "y": 4}},
        },
        {
            "id": "b",
            "fluid": "dhw",
            "from": {"kind": "pipe", "pipe": "a", "cell": {"x": 0, "y": 6}},
            "to": {"kind": "cell", "cell": {"x": 4, "y": 6}},
        },
    ]
    assert "reference_cycle" in check(document, registry)


def test_a_chain_of_tees_is_allowed(document, registry):
    document["pipes"].append(
        {
            "id": "branch",
            "fluid": "primary_supply",
            "from": {"kind": "pipe", "pipe": "supply", "cell": {"x": 4, "y": 1}},
            "to": {"kind": "cell", "cell": {"x": 4, "y": 5}},
        }
    )
    document["pipes"].append(
        {
            "id": "sub-branch",
            "fluid": "primary_supply",
            "from": {"kind": "pipe", "pipe": "branch", "cell": {"x": 4, "y": 3}},
            "to": {"kind": "cell", "cell": {"x": 8, "y": 3}},
        }
    )
    assert check(document, registry) == []


def test_pipes_may_share_cells(document, registry):
    """Deliberately not a rule: a tee shares one by construction, and two runs
    crossing at different z share an xy."""
    document["pipes"].append(
        {
            "id": "crossing",
            "fluid": "cold_water",
            "from": {"kind": "cell", "cell": {"x": 3, "y": -2}},
            "to": {"kind": "cell", "cell": {"x": 3, "y": 4}},
        }
    )
    assert check(document, registry) == []


# ----------------------------------------------------------------------
# Inline placements
# ----------------------------------------------------------------------


def test_an_inline_symbol_sits_on_its_pipe(document, registry):
    document["symbols"][1]["placement"]["cell"] = {"x": 3, "y": 9}
    assert check(document, registry) == ["off_polyline"]


def test_an_inline_symbol_may_not_sit_on_an_endpoint(document, registry):
    """At an endpoint it would collide with the port it is attached to."""
    document["symbols"][1]["placement"]["cell"] = {"x": 5, "y": 1}
    assert check(document, registry) == ["inline_on_endpoint"]


def test_only_an_inline_capable_type_may_sit_on_a_pipe(document, registry):
    document["symbols"][1]["type"] = "tank"
    document["symbols"][1]["props"] = {"capacity": "500 L"}
    assert "not_inline_capable" in check(document, registry)


def test_an_inline_symbol_names_a_known_pipe(document, registry):
    document["symbols"][1]["placement"]["pipe"] = "nowhere"
    assert check(document, registry) == ["unknown_pipe"]


# ----------------------------------------------------------------------
# Projection
# ----------------------------------------------------------------------


def test_a_flat_plate_forces_every_z_to_zero(document, registry):
    document["projection"] = "flat"
    document["pipes"][0]["to"] = {"kind": "cell", "cell": {"x": 5, "y": 1, "z": 1}}
    assert "flat_depth" in check(document, registry)


def test_a_flat_plate_rejects_a_waypoint_off_the_ground(document, registry):
    document["projection"] = "flat"
    document["pipes"][0]["waypoints"] = [{"x": 4, "y": 1, "z": 1}]
    assert "flat_depth" in check(document, registry)


def test_an_isometric_plate_may_climb(document, registry):
    document["pipes"][0]["waypoints"] = [
        {"x": 4, "y": 1},
        {"x": 4, "y": 1, "z": 1},
        {"x": 5, "y": 1, "z": 1},
    ]
    document["pipes"][0]["to"] = {"kind": "cell", "cell": {"x": 5, "y": 1}}
    assert check(document, registry) == []


# ----------------------------------------------------------------------
# Reporting
# ----------------------------------------------------------------------


def test_every_violation_is_reported_at_once(document, registry):
    """An author fixing a large plate should get the whole list, not one error
    per attempt."""
    document["labels"].append(dict(document["labels"][0]))
    document["symbols"][0]["bindings"]["pressure"] = {"kind": "text", "text": "3 bar"}
    document["pipes"][0]["tags"][0]["at"] = {"x": 2, "y": 9}
    assert sorted(check(document, registry)) == [
        "duplicate_id",
        "off_polyline",
        "unknown_slot",
    ]


def test_the_error_points_at_the_offending_element(document, registry):
    document["pipes"][0]["tags"][0]["at"] = {"x": 2, "y": 9}
    with pytest.raises(SchemaValidationError) as exc:
        validate_document(SynopticDocument.model_validate(document), registry)
    assert exc.value.errors[0].loc == ("pipes", 0, "tags", 0, "at")


def test_a_symbol_that_fails_its_type_does_not_break_the_pass(document, registry):
    """A pipe attached to a broken symbol reports its own error instead of
    crashing the run."""
    document["symbols"][0]["type"] = "reactor"
    assert sorted(check(document, registry)) == [
        "unknown_symbol_type",
        "unusable_pipe",
        "unusable_symbol",
    ]


def test_a_broken_pipe_is_not_reported_as_a_missing_one(document, registry):
    """The id is sitting in the author's file; saying it is unknown sends them
    hunting for something that is there."""
    document["symbols"] = [document["symbols"][0]]
    document["pipes"][0]["waypoints"] = [{"x": 3, "y": 4}]
    document["pipes"][0]["tags"] = []
    document["pipes"].append(
        {
            "id": "branch",
            "fluid": "primary_supply",
            "from": {"kind": "pipe", "pipe": "supply", "cell": {"x": 4, "y": 1}},
            "to": {"kind": "cell", "cell": {"x": 4, "y": 5}},
        }
    )
    found = check(document, registry)
    assert "unusable_pipe" in found
    assert "unknown_pipe" not in found


def test_cell_is_hashable_for_membership_checks():
    assert Cell(x=1, y=2) == Cell(x=1, y=2, z=0)
    assert len({Cell(x=1, y=2), Cell(x=1, y=2, z=0)}) == 1


# ----------------------------------------------------------------------
# Bindings, once resolved
# ----------------------------------------------------------------------


class FakeResolver:
    """Hands back one prepared outcome per call, in order; an exception is raised."""

    def __init__(self, *outcomes: ResolvedTarget | Exception) -> None:
        self._outcomes = list(outcomes)

    async def resolve(
        self,
        target: AttributeTarget,  # noqa: ARG002
        *,
        writable: bool = False,  # noqa: ARG002
    ) -> ResolvedTarget:
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    async def list_attribute_coverage(
        self,
        devices: DevicesFilter,  # noqa: ARG002
    ) -> list[AttributeCoverage]:
        return []


def resolved(*device_ids: str, data_type: DataType = DataType.BOOL) -> ResolvedTarget:
    return ResolvedTarget(
        attribute="a",
        device_ids=list(device_ids),
        data_type=data_type,
        excluded_device_ids=[],
    )


async def check_bindings(
    raw: dict, registry: SymbolRegistry, *outcomes: ResolvedTarget | Exception
) -> list:
    document = SynopticDocument.model_validate(raw)
    try:
        await validate_for_save(document, registry, FakeResolver(*outcomes))
    except SchemaValidationError as exc:
        return [(item.loc, item.type) for item in exc.errors]
    return []


def attribute_slot(attribute: str = "temp", **extra: int) -> dict:
    return {
        "kind": "attribute",
        "target": {"devices": {"ids": ["dev-1"]}, "attribute": attribute},
        **extra,
    }


def test_bound_slots_walk_every_element_that_carries_a_binding(document):
    document["pipes"][0]["flow"] = attribute_slot("running")
    document["pipes"][0]["tags"][0]["value"] = attribute_slot()
    document["labels"][0]["value"] = attribute_slot()
    slots = bound_slots(SynopticDocument.model_validate(document))
    assert [(s.loc, s.is_flow) for s in slots] == [
        (("symbols", 0, "bindings", "state"), False),
        (("pipes", 0, "flow"), True),
        (("pipes", 0, "tags", 0, "value"), False),
        (("labels", 0, "value"), False),
    ]


def test_text_slots_are_not_bound(document):
    slots = bound_slots(SynopticDocument.model_validate(document))
    assert [s.loc for s in slots] == [("symbols", 0, "bindings", "state")]


@pytest.mark.asyncio
async def test_a_binding_resolving_to_one_device_is_valid(document, registry):
    assert await check_bindings(document, registry, resolved("dev-1")) == []


@pytest.mark.asyncio
async def test_a_binding_the_resolver_refuses_is_reported_at_its_loc(
    document, registry
):
    outcome = InvalidError("No device in the target exposes 'onoff_state'")
    assert await check_bindings(document, registry, outcome) == [
        (("symbols", 0, "bindings", "state"), "unresolved_target")
    ]


@pytest.mark.asyncio
async def test_a_binding_resolving_to_no_device_is_unresolved(document, registry):
    """A resolver that returns an empty set instead of raising: the author is
    told the filter matched nothing, not to narrow it."""
    assert await check_bindings(document, registry, resolved()) == [
        (("symbols", 0, "bindings", "state"), "unresolved_target")
    ]


@pytest.mark.asyncio
async def test_a_binding_resolving_to_several_devices_is_ambiguous(document, registry):
    assert await check_bindings(document, registry, resolved("dev-1", "dev-2")) == [
        (("symbols", 0, "bindings", "state"), "ambiguous_target")
    ]


@pytest.mark.asyncio
async def test_flow_must_resolve_to_a_bool(document, registry):
    document["pipes"][0]["flow"] = attribute_slot("running")
    outcomes = (resolved("dev-1"), resolved("dev-1", data_type=DataType.FLOAT))
    assert await check_bindings(document, registry, *outcomes) == [
        (("pipes", 0, "flow"), "flow_not_bool")
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("data_type", [DataType.STRING, DataType.BOOL])
async def test_decimals_need_a_numeric_attribute(document, registry, data_type):
    document["labels"][0]["value"] = attribute_slot(decimals=1)
    outcomes = (resolved("dev-1"), resolved("dev-1", data_type=data_type))
    assert await check_bindings(document, registry, *outcomes) == [
        (("labels", 0, "value", "decimals"), "decimals_not_numeric")
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("data_type", [DataType.INT, DataType.FLOAT])
async def test_decimals_on_a_numeric_attribute_are_valid(document, registry, data_type):
    document["labels"][0]["value"] = attribute_slot(decimals=1)
    outcomes = (resolved("dev-1"), resolved("dev-1", data_type=data_type))
    assert await check_bindings(document, registry, *outcomes) == []


@pytest.mark.asyncio
async def test_every_binding_is_reported_at_once(document, registry):
    """A refused slot does not stop the pass: the next one is still judged."""
    document["pipes"][0]["flow"] = attribute_slot("running", decimals=2)
    outcomes = (InvalidError("nope"), resolved("dev-1", data_type=DataType.STRING))
    assert [t for _, t in await check_bindings(document, registry, *outcomes)] == [
        "unresolved_target",
        "flow_not_bool",
        "decimals_not_numeric",
    ]


@pytest.mark.asyncio
async def test_document_and_binding_violations_arrive_together(document, registry):
    """One round-trip: a geometry error and a bad binding in the same list."""
    document["pipes"][0]["tags"][0]["at"] = {"x": 9, "y": 9}
    outcome = InvalidError("nope")
    assert [t for _, t in await check_bindings(document, registry, outcome)] == [
        "off_polyline",
        "unresolved_target",
    ]


@pytest.mark.asyncio
async def test_a_target_shared_by_several_slots_is_resolved_once(document, registry):
    """The plate binds the same attribute of one device from several slots;
    the fleet is walked once for it."""
    document["pipes"][0]["flow"] = attribute_slot("onoff_state")
    document["labels"][0]["value"] = attribute_slot("onoff_state")
    # One outcome for three slots: a second resolve would pop an empty list.
    assert await check_bindings(document, registry, resolved("dev-1")) == []


@pytest.mark.asyncio
async def test_bound_slots_over_budget_are_not_resolved(document, registry):
    document["labels"] = [
        {
            "id": f"l{i}",
            "at": {"x": 0, "y": i},
            "text": "x",
            "role": "note",
            "value": attribute_slot(f"attr_{i}"),
        }
        for i in range(MAX_BOUND_SLOTS)
    ]
    # No outcomes prepared: any resolve call would pop an empty list.
    assert await check_bindings(document, registry) == [
        (("bindings",), "binding_budget_exceeded")
    ]
