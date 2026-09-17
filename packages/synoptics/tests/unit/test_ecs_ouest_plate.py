"""What the ECS Ouest drawing decides on its own: its bay, its captions, the
panoplie its P&ID adds, and that it is the other bay of the same installation.

``docs/specs/synoptic/ecs-ouest.json`` is the Est plate's template with the
third tank column filled in, its own heat pumps and meter, and the bouclage
entering the top row. The probes every committed plate shares are in
``test_plates.py``.
"""

from collections import Counter

import pytest

from synoptics.geometry import polyline_cells, rotate_offset, translate
from synoptics.models import (
    Cell,
    CellEndpoint,
    CellPlacement,
    PipeEndpoint,
    PortEndpoint,
    Symbol,
    SynopticDocument,
    TextSlot,
)
from synoptics.symbols.registry import build_default_registry
from synoptics.validation import bound_slots


@pytest.fixture
def plate(ecs_ouest_raw):
    return SynopticDocument.model_validate(ecs_ouest_raw)


def test_the_plate_binds_none_of_the_est_devices(plate, ecs_est_raw):
    """Same instance, other bay: PAC 01 / 02 and the Ouest meter are their own
    devices. A PAC id copied over from the Est plate would read the wrong
    machine and still validate."""
    est = SynopticDocument.model_validate(ecs_est_raw)

    def ids(document: SynopticDocument) -> set[str]:
        bound = {
            i for s in bound_slots(document) for i in s.slot.target.devices.ids or []
        }
        return bound | {s.device_id for s in document.symbols if s.device_id}

    assert ids(plate).isdisjoint(ids(est))


def test_the_bay_is_the_drawing_s(plate):
    """Nine 500 L ballons in three columns of three. The drawing feeds the
    bay at its top-left ballon, takes the departure off the top, brings the
    bouclage into the right ballon of the top row and drains the bottom-right
    ballon. Each column is chained from its top tank, the third fed by a tee
    off the second column's overhead feed (an overhead run along the next row
    back would project onto the departure collector), so no tank is fed along
    a row as the Est bay's seventh is."""
    tanks = [s for s in plate.symbols if s.type == "tank"]
    assert Counter(t.placement.cell.x for t in tanks) == {10: 3, 14: 3, 18: 3}
    assert Counter(t.placement.cell.y for t in tanks) == {0: 3, 4: 3, 8: 3}
    pipes = {p.id: p for p in plate.pipes}
    assert pipes["feed-col-1"].to == PortEndpoint(symbol="b01", port="primary_in")
    assert pipes["feed-col-3"].from_.kind == "pipe"
    assert pipes["feed-col-3"].from_.pipe == "feed-col-2"
    assert pipes["feed-col-3"].from_.cell.z == 1
    departures = [p.from_ for p in plate.pipes if p.fluid == "dhw"]
    for n in (1, 2, 3):
        assert PortEndpoint(symbol=f"b0{n}", port="dhw_out") in departures
    assert pipes["dhw-loop-return"].to == PortEndpoint(symbol="b03", port="dhw_in")
    assert pipes["col-3-return"].from_ == PortEndpoint(symbol="b09", port="primary_out")
    for upper, lower in (("b03", "b06"), ("b06", "b09")):
        assert pipes[f"{upper}-{lower}"].from_ == PortEndpoint(
            symbol=upper, port="primary_out"
        )
        assert pipes[f"{upper}-{lower}"].to == PortEndpoint(
            symbol=lower, port="primary_in"
        )
    row_fed = [
        p.id
        for p in plate.pipes
        if p.from_.kind == "port" and p.from_.port == "dhw_out" and p.fluid != "dhw"
    ]
    assert row_fed == []


def _cells_along(plate: SynopticDocument, pipe_id: str) -> list[Cell]:
    """Every cell of a run in flow order, endpoints resolved through the
    registry, so a position on the run can be compared with another."""
    registry = build_default_registry()
    symbols = {s.id: s for s in plate.symbols}

    def resolve(end: PortEndpoint | CellEndpoint | PipeEndpoint) -> Cell:
        if not isinstance(end, PortEndpoint):
            return end.cell
        symbol = symbols[end.symbol]
        placement = symbol.placement
        rotation = placement.rotation if isinstance(placement, CellPlacement) else 0
        port = registry.ports_of(symbol)[end.port]
        return translate(placement.cell, rotate_offset(port.offset, rotation))

    pipe = next(p for p in plate.pipes if p.id == pipe_id)
    return polyline_cells([resolve(pipe.from_), *pipe.waypoints, resolve(pipe.to)])


def test_the_panoplie_is_the_p_and_id_s(plate):
    """The panoplie P&IDs ("Départ EC 104 / 80 Chambres") draw what the GTB
    view leaves out, and this plate is the first to carry it (the Est plate
    follows in its own issue): on the retour ECS a pompe de bouclage then a réchauffeur
    de boucle before the water goes back to the tanks, never to the mitigeur;
    on the départ a pompe de surpression before the mitigeur; and the
    mitigeur's cold inlet fed by eau froide adoucie. The bay's pump pair and
    heater are read by the iSMA controller but not yet identified, so their
    states are marked, not bound to a guessed pair."""
    symbols = {s.id: s for s in plate.symbols}
    pipes = {p.id: p for p in plate.pipes}

    def on(s: Symbol) -> tuple[str, str | None]:
        return (s.placement.kind, getattr(s.placement, "pipe", None))

    assert (symbols["pompe-bouclage"].type, on(symbols["pompe-bouclage"])) == (
        "pump",
        ("pipe", "dhw-loop-return"),
    )
    assert (symbols["rechauffeur-boucle"].type, on(symbols["rechauffeur-boucle"])) == (
        "loop_heater",
        ("pipe", "dhw-loop-return"),
    )
    assert (symbols["pompe-surpression"].type, on(symbols["pompe-surpression"])) == (
        "pump",
        ("pipe", "dhw-departure"),
    )
    # The loop return ends in the bay, on a tank's dhw inlet.
    assert pipes["dhw-loop-return"].to.kind == "port"
    assert pipes["dhw-loop-return"].to.port == "dhw_in"
    assert symbols[pipes["dhw-loop-return"].to.symbol].type == "tank"
    # In flow order from the link: the retour sensor, the pump, the heater.
    along = _cells_along(plate, "dhw-loop-return")
    order = [
        along.index(cell)
        for cell in (
            pipes["dhw-loop-return"].tags[0].at,
            symbols["pompe-bouclage"].placement.cell,
            symbols["rechauffeur-boucle"].placement.cell,
        )
    ]
    assert order == sorted(order)
    not_identified = TextSlot(text="non identifiée")
    assert symbols["pompe-bouclage"].bindings == {"state": not_identified}
    assert symbols["rechauffeur-boucle"].bindings == {
        "state": not_identified,
        "fault": not_identified,
    }
    assert symbols["pompe-surpression"].bindings == {}
    assert symbols["link-efa"].type == "link"
    assert pipes["efa-mitigeur"].fluid == "cold_water"
    assert pipes["efa-mitigeur"].from_ == PortEndpoint(symbol="link-efa", port="out")
    assert pipes["efa-mitigeur"].to == PortEndpoint(symbol="mitigeur", port="cold_in")


def test_the_captions_are_the_drawing_s_words(plate):
    """The bay caption carries the drawn count and no litre total: the station
    the GTB names for this bay is "4000L" and nine drawn ballons make 4 500 L,
    so a total would assert what no source confirms. The counter label reads
    the meter raw, in the unit the site's meter pages use."""
    labels = {label.id: label for label in plate.labels}
    assert labels["title"].text == "PRODUCTION ECS OUEST"
    assert labels["zone-storage"].text == "STOCKAGE · 9 × 500 L"  # noqa: RUF001
    counter = labels["cpt-ballon-ouest"].value
    assert counter.target.attribute == "energy"
    assert (counter.unit, counter.decimals) == ("Wh", 0)
