"""What the two hot-water bays' shared template decides: the mitigeur
readings no device reads, one sanitary circuit, the panoplie the P&IDs draw,
and a tank bay fed once per tank.

``docs/specs/synoptic/ecs-ouest.json`` is the Est plate's template with a
third column; the probes every committed plate shares are in
``test_plates.py``, and what one bay's drawing decides on its own in its
own file.
"""

from collections import Counter

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


def test_the_mitigeur_readings_say_they_are_not_measured(ecs_plate):
    """Both drawings show the mitigeur départ and retour; no device on the
    instance reads either station's (the WAGO registers have read 0 since
    June, the gateway's optional probes are not fitted). Each rides its run
    as a tag carrying a text slot that says so, never a probe that reads
    something else and never a silent gap: the départ on the mitigeur's
    outlet, the retour on the bouclage return, where the panoplie's sensors
    sit."""
    not_measured = TextSlot(text="non mesurée")
    assert {t.id: (p.id, t.value) for p in ecs_plate.pipes for t in p.tags} == {
        "tt-depart": ("dhw-supply", not_measured),
        "tt-retour": ("dhw-loop-return", not_measured),
    }
    assert next(s for s in ecs_plate.symbols if s.id == "mitigeur").bindings == {}


def test_the_plate_is_one_sanitary_circuit(ecs_plate):
    """The heat pumps heat the sanitary water directly, so a bay plate has one
    circuit: the production loop (heat pumps, bay, back) keyed `primary_*`,
    the departure `dhw`, the bouclage `dhw_loop`, and cold water twice, as
    the make-up on the return to the heat pumps and as the mitigeur's cold
    inlet, never on a tank."""
    fluid = {p.id: p.fluid for p in ecs_plate.pipes}
    pac_supply = [p for p in ecs_plate.pipes if p.id.startswith("pac-") and p.flow]
    assert len(pac_supply) == 2
    assert {p.fluid for p in pac_supply} == {fluid["feed-col-1"]} == {"primary_supply"}
    assert fluid["col-1-return"] == fluid["return-loop"] == "primary_return"
    assert fluid["col-1-dhw-out"] == fluid["dhw-supply"] == "dhw"
    assert fluid["dhw-loop-return"] == "dhw_loop"
    assert fluid["cold-main"] == fluid["efa-mitigeur"] == "cold_water"
    assert set(fluid.values()) == {
        "primary_supply",
        "primary_return",
        "dhw",
        "dhw_loop",
        "cold_water",
    }
    pipes = {p.id: p for p in ecs_plate.pipes}
    assert pipes["cold-main"].to == PortEndpoint(symbol="collector-return", port="in_4")


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


def test_the_panoplie_is_the_p_and_id_s(ecs_plate):
    """The panoplie P&IDs ("Départ EC 104 / 80 Chambres") draw what the GTB
    view leaves out, on both plates: on the retour ECS a pompe de bouclage
    then a réchauffeur de boucle before the water goes back to the tanks,
    never to the mitigeur; on the départ a pompe de surpression before the
    mitigeur; and the
    mitigeur's cold inlet fed by eau froide adoucie. The bay's pump pair and
    heater are read by the iSMA controller but not yet identified, so their
    states are marked, not bound to a guessed pair."""
    symbols = {s.id: s for s in ecs_plate.symbols}
    pipes = {p.id: p for p in ecs_plate.pipes}

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
    along = _cells_along(ecs_plate, "dhw-loop-return")
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


def test_every_tank_is_unnamed_and_fed_once(ecs_plate):
    """The drawings label every ballon "Ballon ECS Q TON 500L" and number
    none, so no tank carries a label; and every tank is fed at its upper
    inlet by exactly one run, so no column is left hanging and none is fed
    twice."""
    tanks = [s for s in ecs_plate.symbols if s.type == "tank"]
    assert tanks
    assert all(t.label is None for t in tanks)
    fed = Counter(
        p.to.symbol
        for p in ecs_plate.pipes
        if isinstance(p.to, PortEndpoint) and p.to.port == "primary_in"
    )
    assert fed == {t.id: 1 for t in tanks}
