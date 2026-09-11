"""Save-time rules for a synoptic document.

Everything decidable from one field lives on the models; everything needing the
registry or another element lives here. A violation is an error at save time,
never a blank tile discovered in production.

The pass collects every violation instead of stopping at the first: an author
fixing a thirty-four pipe plate should get the whole list at once.

Resolving a binding needs a target resolver, which the API layer builds and
injects into the service. This package enumerates the slots to resolve
(:func:`bound_slots`) and runs the rule against that resolver as part of
:func:`validate_for_save`, so the rule's vocabulary still has one owner and
document and binding violations arrive in one error.
"""

import contextlib
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from itertools import pairwise

from pydantic import BaseModel, ValidationError

from models.errors import (
    InvalidError,
    NotFoundError,
    SchemaValidationError,
    ValidationErrorItem,
)
from models.targets import ResolvedTarget, TargetResolver
from models.types import DataType
from synoptics.geometry import (
    direction,
    is_axis_aligned,
    polyline_cells,
    rotate_offset,
    rotate_side,
    translate,
)
from synoptics.models import (
    MAX_BOUND_SLOTS,
    MAX_POLYLINE_CELLS,
    AttributeSlot,
    Cell,
    CellPlacement,
    Endpoint,
    Pipe,
    PipeEndpoint,
    PipePlacement,
    PortEndpoint,
    Side,
    Symbol,
    SynopticDocument,
)
from synoptics.symbols.registry import SymbolRegistry


class Violation(StrEnum):
    """The ``type`` of every save-time error this package emits.

    This is the vocabulary an editor branches on, so it has one definition.
    Messages may be reworded freely; these values may not.
    """

    DUPLICATE_ID = "duplicate_id"
    UNKNOWN_SYMBOL_TYPE = "unknown_symbol_type"
    INVALID_PROPS = "invalid_props"
    UNKNOWN_SLOT = "unknown_slot"
    MISSING_SLOT = "missing_slot"
    ROTATION_LOCKED = "rotation_locked"
    PORT_OFF_GRID = "port_off_grid"
    UNKNOWN_SYMBOL = "unknown_symbol"
    UNUSABLE_SYMBOL = "unusable_symbol"
    UNKNOWN_PORT = "unknown_port"
    ZERO_LENGTH_SEGMENT = "zero_length_segment"
    DIAGONAL_SEGMENT = "diagonal_segment"
    POLYLINE_BUDGET_EXCEEDED = "polyline_budget_exceeded"
    PORT_SIDE_MISMATCH = "port_side_mismatch"
    OFF_POLYLINE = "off_polyline"
    SELF_REFERENCE = "self_reference"
    UNKNOWN_PIPE = "unknown_pipe"
    UNUSABLE_PIPE = "unusable_pipe"
    REFERENCE_CYCLE = "reference_cycle"
    NOT_INLINE_CAPABLE = "not_inline_capable"
    INLINE_ON_ENDPOINT = "inline_on_endpoint"
    FLAT_DEPTH = "flat_depth"
    BINDING_BUDGET_EXCEEDED = "binding_budget_exceeded"
    UNRESOLVED_TARGET = "unresolved_target"
    AMBIGUOUS_TARGET = "ambiguous_target"
    FLOW_NOT_BOOL = "flow_not_bool"
    DECIMALS_NOT_NUMERIC = "decimals_not_numeric"


_SUMMARY_PREFIX = "Invalid synoptic: "


class _Errors:
    """Accumulates violations in pydantic's ``{loc, msg, type}`` shape."""

    def __init__(self) -> None:
        self.items: list[ValidationErrorItem] = []

    def add(self, loc: tuple[str | int, ...], msg: str, type_: Violation) -> None:
        self.items.append(ValidationErrorItem(loc=loc, msg=msg, type=type_))

    def raise_if_any(self) -> None:
        if self.items:
            raise SchemaValidationError(self.items, summary_prefix=_SUMMARY_PREFIX)


@dataclass(frozen=True)
class _Run:
    """The cells a validated pipe crosses, as sets.

    Tags, tees and inline symbols are unbounded in number and each asks "is
    this cell on that run"; against a list of pydantic models that is a
    linear scan per question, and a few thousand of them on one long run cost
    tens of seconds. ``Cell`` is frozen precisely so it can be a set member.
    """

    cells: frozenset[Cell]
    interior: frozenset[Cell]
    """Every cell but the two ends: where an inline symbol may sit. A run that
    doubles back over its own first cell passes through it again in the
    middle, so this is position-based, not identity-based."""


def validate_document(document: SynopticDocument, registry: SymbolRegistry) -> None:
    """Raise :class:`~models.errors.SchemaValidationError` unless *document*
    satisfies every save-time rule decidable without a resolver."""
    errors = _Errors()
    _collect_document(document, registry, errors)
    errors.raise_if_any()


async def validate_for_save(
    document: SynopticDocument, registry: SymbolRegistry, resolver: TargetResolver
) -> None:
    """Every save-time rule, document and bindings, reported as one error."""
    errors = _Errors()
    _collect_document(document, registry, errors)
    await _collect_bindings(document, resolver, errors)
    errors.raise_if_any()


def _collect_document(
    document: SynopticDocument, registry: SymbolRegistry, errors: _Errors
) -> None:
    duplicates = _check_unique_ids(document, errors)
    ports = _check_symbols(document, registry, duplicates, errors)
    polylines = _check_pipes(document, ports, duplicates, errors)
    _check_pipe_references(document, polylines, errors)
    _check_inline_placements(document, registry, polylines, duplicates, errors)
    _check_flat_projection(document, errors)


# ----------------------------------------------------------------------
# Bindings
# ----------------------------------------------------------------------


@dataclass(frozen=True)
class BoundSlot:
    """One ``attribute`` slot of a document and where it sits."""

    loc: tuple[str | int, ...]
    slot: AttributeSlot
    is_flow: bool = False


def bound_slots(document: SynopticDocument) -> list[BoundSlot]:
    """Every ``attribute`` slot on the plate, in document order.

    Symbol bindings, pipe ``flow``, tag values and label values, so a consumer
    (resolution, live subscription, fault list, binding picker) never has to
    know which elements carry a binding.
    """
    found: list[BoundSlot] = []

    def add(
        loc: tuple[str | int, ...], value: object, *, is_flow: bool = False
    ) -> None:
        if isinstance(value, AttributeSlot):
            found.append(BoundSlot(loc, value, is_flow))

    for i, symbol in enumerate(document.symbols):
        for slot, value in symbol.bindings.items():
            add(("symbols", i, "bindings", slot), value)
    for i, pipe in enumerate(document.pipes):
        add(("pipes", i, "flow"), pipe.flow, is_flow=True)
        for j, tag in enumerate(pipe.tags):
            add(("pipes", i, "tags", j, "value"), tag.value)
    for i, label in enumerate(document.labels):
        add(("labels", i, "value"), label.value)
    return found


async def _collect_bindings(
    document: SynopticDocument, resolver: TargetResolver, errors: _Errors
) -> None:
    """Resolve every bound slot and record each one that does not name exactly
    one device, carry a bool behind ``flow``, or keep ``decimals`` to a numeric
    attribute. A slot the resolver refuses is recorded at its ``loc`` like the
    others, so an author fixing thirty bindings sees them all at once.

    Resolution costs a fleet walk per target, so the slot count is checked
    against :data:`MAX_BOUND_SLOTS` before anything is resolved, and each
    distinct target is resolved once however many slots share it.
    """
    slots = bound_slots(document)
    if len(slots) > MAX_BOUND_SLOTS:
        errors.add(
            ("bindings",),
            f"{len(slots)} bound slots exceed the budget of {MAX_BOUND_SLOTS}",
            Violation.BINDING_BUDGET_EXCEEDED,
        )
        return
    outcomes: dict[str, ResolvedTarget | InvalidError] = {}
    for bound in slots:
        key = bound.slot.target.model_dump_json()
        if key not in outcomes:
            try:
                outcomes[key] = await resolver.resolve(bound.slot.target)
            except InvalidError as exc:
                outcomes[key] = exc
        outcome = outcomes[key]
        if isinstance(outcome, InvalidError):
            errors.add(bound.loc, str(outcome), Violation.UNRESOLVED_TARGET)
        else:
            _check_resolved(bound, outcome, errors)


def _check_resolved(bound: BoundSlot, target: ResolvedTarget, errors: _Errors) -> None:
    if not target.device_ids:
        errors.add(
            bound.loc, "Target resolves to no device", Violation.UNRESOLVED_TARGET
        )
    elif len(target.device_ids) > 1:
        errors.add(
            bound.loc,
            f"Target resolves to {len(target.device_ids)} devices, expected 1",
            Violation.AMBIGUOUS_TARGET,
        )
    if bound.is_flow and target.data_type != DataType.BOOL:
        errors.add(
            bound.loc,
            f"Flow attribute is {target.data_type}, expected bool",
            Violation.FLOW_NOT_BOOL,
        )
    numeric = target.data_type in (DataType.INT, DataType.FLOAT)
    if bound.slot.decimals is not None and not numeric:
        errors.add(
            (*bound.loc, "decimals"),
            f"Decimals set on a {target.data_type} attribute",
            Violation.DECIMALS_NOT_NUMERIC,
        )


# ----------------------------------------------------------------------
# Ids
# ----------------------------------------------------------------------


def _check_unique_ids(document: SynopticDocument, errors: _Errors) -> set[str]:
    """Symbols, pipes, tags and labels share one id namespace, because pipes
    reference symbols and other pipes by id.

    Returns the ids that collided. Later passes skip those elements: with two
    symbols called ``pac-01`` there is no answer to "which one does this pipe
    attach to", and resolving against an arbitrary winner reports a phantom
    missing port on top of the real duplicate.
    """
    seen: set[str] = set()
    duplicates: set[str] = set()
    for loc, element_id in _all_ids(document):
        if element_id in seen:
            errors.add(
                loc, f"Duplicate element id {element_id!r}", Violation.DUPLICATE_ID
            )
            duplicates.add(element_id)
        seen.add(element_id)
    return duplicates


def _all_ids(
    document: SynopticDocument,
) -> Iterator[tuple[tuple[str | int, ...], str]]:
    for i, symbol in enumerate(document.symbols):
        yield ("symbols", i, "id"), symbol.id
    for i, pipe in enumerate(document.pipes):
        yield ("pipes", i, "id"), pipe.id
        for j, tag in enumerate(pipe.tags):
            yield ("pipes", i, "tags", j, "id"), tag.id
    for i, label in enumerate(document.labels):
        yield ("labels", i, "id"), label.id


# ----------------------------------------------------------------------
# Symbols
# ----------------------------------------------------------------------


def _check_symbols(
    document: SynopticDocument,
    registry: SymbolRegistry,
    duplicates: set[str],
    errors: _Errors,
) -> dict[str, dict[str, tuple[Cell, Side]]]:
    """Validate every symbol against its type and resolve its ports.

    Returns the absolute cell and face of each symbol's ports, which the pipe
    rules need. A symbol that fails validation contributes no ports, so a pipe
    attached to it reports its own error rather than crashing the pass.
    """
    resolved: dict[str, dict[str, tuple[Cell, Side]]] = {}
    for i, symbol in enumerate(document.symbols):
        loc: tuple[str | int, ...] = ("symbols", i)
        if symbol.id in duplicates:
            continue
        try:
            symbol_type = registry.get(symbol.type)
        except NotFoundError:
            errors.add(
                (*loc, "type"),
                f"Unknown symbol type {symbol.type!r}",
                Violation.UNKNOWN_SYMBOL_TYPE,
            )
            continue
        try:
            props = registry.validate_props(symbol.type, symbol.props)
        except ValueError as exc:
            errors.add((*loc, "props"), str(exc), Violation.INVALID_PROPS)
            continue
        _check_bindings(
            symbol, symbol_type.slots, symbol_type.required_slots, loc, errors
        )
        if (
            symbol_type.rotation_locked
            and isinstance(symbol.placement, CellPlacement)
            and symbol.placement.rotation != 0
        ):
            errors.add(
                (*loc, "placement", "rotation"),
                f"Symbol type {symbol.type!r} must have rotation 0: its props "
                f"already say which way it runs",
                Violation.ROTATION_LOCKED,
            )
            continue
        try:
            resolved[symbol.id] = _absolute_ports(symbol, registry, props)
        except ValidationError:
            # The placement is in bounds but a port offset carries it past
            # the edge of the grid; ``Cell`` refuses the result.
            errors.add(
                (*loc, "placement"),
                f"Symbol {symbol.id!r} has a port outside the grid",
                Violation.PORT_OFF_GRID,
            )
    return resolved


def _check_bindings(
    symbol: Symbol,
    slots: Sequence[str],
    required: frozenset[str],
    loc: tuple[str | int, ...],
    errors: _Errors,
) -> None:
    for slot in symbol.bindings:
        if slot not in slots:
            errors.add(
                (*loc, "bindings", slot),
                f"Symbol type {symbol.type!r} declares no slot {slot!r}",
                Violation.UNKNOWN_SLOT,
            )
    for slot in sorted(required - set(symbol.bindings)):
        errors.add(
            (*loc, "bindings"),
            f"Symbol type {symbol.type!r} requires slot {slot!r}",
            Violation.MISSING_SLOT,
        )


def _absolute_ports(
    symbol: Symbol, registry: SymbolRegistry, props: BaseModel
) -> dict[str, tuple[Cell, Side]]:
    """Each port's cell on the grid and the face it leaves through, with the
    instance's rotation applied to both."""
    rotation = (
        symbol.placement.rotation if isinstance(symbol.placement, CellPlacement) else 0
    )
    origin = symbol.placement.cell
    return {
        name: (
            translate(origin, rotate_offset(port.offset, rotation)),
            rotate_side(port.side, rotation),
        )
        for name, port in registry.ports_of(symbol, props).items()
    }


# ----------------------------------------------------------------------
# Pipes
# ----------------------------------------------------------------------


def _check_pipes(
    document: SynopticDocument,
    ports: Mapping[str, Mapping[str, tuple[Cell, Side]]],
    duplicates: set[str],
    errors: _Errors,
) -> dict[str, _Run]:
    """Validate each run's geometry and return the cells it passes through.

    A pipe whose endpoints or segments are wrong contributes no polyline, so
    the tees and inline symbols that reference it report only their own error.
    """
    polylines: dict[str, _Run] = {}
    budget = MAX_POLYLINE_CELLS
    for i, pipe in enumerate(document.pipes):
        loc: tuple[str | int, ...] = ("pipes", i)
        if pipe.id in duplicates:
            continue
        corners = _corners(document, pipe, ports, loc, errors)
        if corners is None:
            continue
        if not _check_segments(corners, loc, errors):
            continue
        length = _run_length(corners)
        if length > budget:
            errors.add(
                loc,
                f"Pipe {pipe.id!r} crosses {length} cells, more than the "
                f"{budget} left of the document's {MAX_POLYLINE_CELLS}",
                Violation.POLYLINE_BUDGET_EXCEEDED,
            )
            continue
        budget -= length
        cells = polyline_cells(corners)
        run = _Run(frozenset(cells), frozenset(cells[1:-1]))
        _check_port_sides(pipe, corners, ports, loc, errors)
        _check_tags(pipe, run, i, errors)
        polylines[pipe.id] = run
    return polylines


def _corners(
    document: SynopticDocument,
    pipe: Pipe,
    ports: Mapping[str, Mapping[str, tuple[Cell, Side]]],
    loc: tuple[str | int, ...],
    errors: _Errors,
) -> list[Cell] | None:
    """The authored corners of a run: its two endpoint cells and its waypoints.

    A ``pipe`` endpoint carries its own cell, so no run depends on another run
    being resolved first; the tee's cell is checked separately once every
    polyline is known.
    """
    start = _endpoint_cell(document, pipe.from_, ports, (*loc, "from"), errors)
    end = _endpoint_cell(document, pipe.to, ports, (*loc, "to"), errors)
    if start is None or end is None:
        return None
    return [start, *pipe.waypoints, end]


def _endpoint_cell(
    document: SynopticDocument,
    endpoint: Endpoint,
    ports: Mapping[str, Mapping[str, tuple[Cell, Side]]],
    loc: tuple[str | int, ...],
    errors: _Errors,
) -> Cell | None:
    if not isinstance(endpoint, PortEndpoint):
        return endpoint.cell
    symbol_ports = ports.get(endpoint.symbol)
    if symbol_ports is None:
        _report_unusable(
            [s.id for s in document.symbols],
            endpoint.symbol,
            "Symbol",
            (*loc, "symbol"),
            errors,
        )
        return None
    port = symbol_ports.get(endpoint.port)
    if port is None:
        errors.add(
            (*loc, "port"),
            f"Symbol {endpoint.symbol!r} has no port {endpoint.port!r}",
            Violation.UNKNOWN_PORT,
        )
        return None
    return port[0]


def _run_length(corners: Sequence[Cell]) -> int:
    """How many cells :func:`polyline_cells` would produce, without producing
    them. Segments are axis-aligned by now, so each spans its one delta."""
    return 1 + sum(
        abs(b.x - a.x) + abs(b.y - a.y) + abs(b.z - a.z) for a, b in pairwise(corners)
    )


def _check_segments(
    corners: Sequence[Cell], loc: tuple[str | int, ...], errors: _Errors
) -> bool:
    """Every segment moves along exactly one axis, ``z`` included.

    A zero-length segment differs on no axis, so it fails the same check; it is
    reported separately because "not axis-aligned" reads as a wrong diagnosis
    for a waypoint repeated twice.
    """
    ok = True
    for i, (a, b) in enumerate(pairwise(corners)):
        if a == b:
            errors.add(
                loc,
                f"Segment {i} at {_fmt(a)} has zero length",
                Violation.ZERO_LENGTH_SEGMENT,
            )
            ok = False
        elif not is_axis_aligned(a, b):
            errors.add(
                loc,
                f"Segment {i} from {_fmt(a)} to {_fmt(b)} is not axis-aligned",
                Violation.DIAGONAL_SEGMENT,
            )
            ok = False
    return ok


def _check_port_sides(
    pipe: Pipe,
    corners: Sequence[Cell],
    ports: Mapping[str, Mapping[str, tuple[Cell, Side]]],
    loc: tuple[str | int, ...],
    errors: _Errors,
) -> None:
    """A run leaves and arrives through the face its ports declare."""
    ends = (
        (pipe.from_, corners[0], corners[1], "from"),
        (pipe.to, corners[-1], corners[-2], "to"),
    )
    for endpoint, at, neighbour, field_name in ends:
        if not isinstance(endpoint, PortEndpoint):
            continue
        _, side = ports[endpoint.symbol][endpoint.port]
        actual = direction(at, neighbour)
        if actual != side:
            errors.add(
                (*loc, field_name),
                f"Port {endpoint.symbol!r}.{endpoint.port!r} faces {side} but the "
                f"run leaves it towards {actual}",
                Violation.PORT_SIDE_MISMATCH,
            )


def _check_tags(pipe: Pipe, run: _Run, index: int, errors: _Errors) -> None:
    for j, tag in enumerate(pipe.tags):
        if tag.at not in run.cells:
            errors.add(
                ("pipes", index, "tags", j, "at"),
                f"Tag {tag.id!r} at {_fmt(tag.at)} is not on pipe {pipe.id!r}",
                Violation.OFF_POLYLINE,
            )


def _check_pipe_references(
    document: SynopticDocument,
    polylines: Mapping[str, _Run],
    errors: _Errors,
) -> None:
    """Tees name another run and a cell on it, and the reference graph is
    acyclic. Chains are fine; a cycle has no branch point to draw from."""
    edges: dict[str, set[str]] = {}
    for i, pipe in enumerate(document.pipes):
        for endpoint, field_name in ((pipe.from_, "from"), (pipe.to, "to")):
            if not isinstance(endpoint, PipeEndpoint):
                continue
            loc: tuple[str | int, ...] = ("pipes", i, field_name)
            if endpoint.pipe == pipe.id:
                errors.add(
                    loc, "A pipe cannot tee onto itself", Violation.SELF_REFERENCE
                )
                continue
            run = polylines.get(endpoint.pipe)
            if run is None:
                _report_unusable(
                    [p.id for p in document.pipes],
                    endpoint.pipe,
                    "Pipe",
                    (*loc, "pipe"),
                    errors,
                )
                continue
            if endpoint.cell not in run.cells:
                errors.add(
                    (*loc, "cell"),
                    f"{_fmt(endpoint.cell)} is not on pipe {endpoint.pipe!r}",
                    Violation.OFF_POLYLINE,
                )
            edges.setdefault(pipe.id, set()).add(endpoint.pipe)
    cycle = _find_cycle(edges)
    if cycle:
        errors.add(
            ("pipes",),
            f"Pipes reference each other in a cycle: {' -> '.join(cycle)}",
            Violation.REFERENCE_CYCLE,
        )


_REFERENCE_VIOLATIONS: dict[str, tuple[Violation, Violation]] = {
    "Symbol": (Violation.UNUSABLE_SYMBOL, Violation.UNKNOWN_SYMBOL),
    "Pipe": (Violation.UNUSABLE_PIPE, Violation.UNKNOWN_PIPE),
}
"""Per referenced kind: the code when it exists but failed, and when it does not."""


def _report_unusable(
    known_ids: Iterable[str],
    element_id: str,
    kind: str,
    loc: tuple[str | int, ...],
    errors: _Errors,
) -> None:
    """Say which of the two things is actually wrong.

    An element is only resolved once it has validated, so a missing entry means
    either the id does not exist or the element it names is already broken.
    Reporting both as "unknown" sends an author hunting for an id sitting in
    their own file.
    """
    unusable, unknown = _REFERENCE_VIOLATIONS[kind]
    if element_id in set(known_ids):
        errors.add(
            loc,
            f"{kind} {element_id!r} cannot be referenced: it did not itself validate",
            unusable,
        )
        return
    errors.add(loc, f"Unknown {kind.lower()} {element_id!r}", unknown)


def _find_cycle(edges: Mapping[str, Iterable[str]]) -> list[str] | None:
    """Depth-first search returning one cycle of the reference graph, if any.

    Iterative on an explicit stack: a chain of a few thousand tees is a valid
    document, and recursing it would raise ``RecursionError`` out of a function
    whose contract is to return a list of authoring errors.
    """
    done: set[str] = set()

    for root in edges:
        if root in done:
            continue
        path: list[str] = []
        on_path: set[str] = set()
        # (node, whether its children have been pushed already)
        stack: list[tuple[str, bool]] = [(root, False)]
        while stack:
            node, expanded = stack.pop()
            if expanded:
                on_path.discard(path.pop())
                done.add(node)
                continue
            if node in done:
                continue
            if node in on_path:
                return [*path[path.index(node) :], node]
            path.append(node)
            on_path.add(node)
            stack.append((node, True))
            stack.extend((nxt, False) for nxt in edges.get(node, ()))
    return None


# ----------------------------------------------------------------------
# Inline placements and projection
# ----------------------------------------------------------------------


def _check_inline_placements(
    document: SynopticDocument,
    registry: SymbolRegistry,
    polylines: Mapping[str, _Run],
    duplicates: set[str],
    errors: _Errors,
) -> None:
    """An inline symbol sits at a cell strictly inside a run of an
    inline-capable type: at an endpoint it would collide with the port."""
    for i, symbol in enumerate(document.symbols):
        placement = symbol.placement
        if not isinstance(placement, PipePlacement):
            continue
        if symbol.id in duplicates:
            continue
        loc: tuple[str | int, ...] = ("symbols", i, "placement")
        # An unknown type was already reported by the symbol pass.
        with contextlib.suppress(NotFoundError):
            if not registry.get(symbol.type).inline:
                errors.add(
                    loc,
                    f"Symbol type {symbol.type!r} cannot be placed on a pipe",
                    Violation.NOT_INLINE_CAPABLE,
                )
        run = polylines.get(placement.pipe)
        if run is None:
            _report_unusable(
                [p.id for p in document.pipes],
                placement.pipe,
                "Pipe",
                (*loc, "pipe"),
                errors,
            )
            continue
        if placement.cell not in run.cells:
            errors.add(
                (*loc, "cell"),
                f"{_fmt(placement.cell)} is not on pipe {placement.pipe!r}",
                Violation.OFF_POLYLINE,
            )
        elif placement.cell not in run.interior:
            errors.add(
                (*loc, "cell"),
                f"{_fmt(placement.cell)} is an endpoint of pipe "
                f"{placement.pipe!r}, not a cell inside the run",
                Violation.INLINE_ON_ENDPOINT,
            )


def _check_flat_projection(document: SynopticDocument, errors: _Errors) -> None:
    """A flat plate is the same document with every ``z`` forced to 0."""
    if document.projection != "flat":
        return
    for loc, z in _all_depths(document):
        if z:
            errors.add(
                loc, "A flat projection requires every z to be 0", Violation.FLAT_DEPTH
            )


def _all_depths(
    document: SynopticDocument,
) -> Iterator[tuple[tuple[str | int, ...], float]]:
    for i, symbol in enumerate(document.symbols):
        yield ("symbols", i, "placement", "cell"), symbol.placement.cell.z
    for i, pipe in enumerate(document.pipes):
        for endpoint, field_name in ((pipe.from_, "from"), (pipe.to, "to")):
            if not isinstance(endpoint, PortEndpoint):
                yield ("pipes", i, field_name, "cell"), endpoint.cell.z
        for j, waypoint in enumerate(pipe.waypoints):
            yield ("pipes", i, "waypoints", j), waypoint.z
        for j, tag in enumerate(pipe.tags):
            yield ("pipes", i, "tags", j, "at"), tag.at.z
    for i, label in enumerate(document.labels):
        yield ("labels", i, "at"), label.at.z


def _fmt(cell: Cell) -> str:
    return f"({cell.x},{cell.y},{cell.z})"
