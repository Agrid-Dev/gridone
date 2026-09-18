"""Registry of the symbol types a plate may place.

Mirrors ``dashboards.widgets.registry``: the single source of truth for what a
type is, so adding one is a registration rather than a branch on ``type``
somewhere in the service.
"""

from collections.abc import Mapping
from dataclasses import asdict
from types import MappingProxyType
from typing import Any

from pydantic import BaseModel, ValidationError

from models.errors import InvalidError, NotFoundError
from synoptics.models import Cell, Symbol
from synoptics.symbols.props import CollectorProps, LinkProps, NoProps, TankProps
from synoptics.symbols.types import Footprint, Port, SymbolType


class SymbolRegistry:
    """Validates a symbol against its type and publishes the type's schema."""

    def __init__(self) -> None:
        self._types: dict[str, SymbolType] = {}

    def register(self, symbol_type: SymbolType) -> None:
        if symbol_type.type in self._types:
            msg = f"Symbol type {symbol_type.type!r} is already registered"
            raise InvalidError(msg)
        # A required slot outside ``slots`` can never be satisfied: binding it
        # is an unknown slot, omitting it is a missing one. Catch the typo here
        # rather than in every document that places the type.
        unknown = symbol_type.required_slots - set(symbol_type.slots)
        if unknown:
            names = ", ".join(sorted(unknown))
            msg = (
                f"Symbol type {symbol_type.type!r} requires slots it does not "
                f"declare: {names}"
            )
            raise InvalidError(msg)
        self._types[symbol_type.type] = symbol_type

    def get(self, type_: str) -> SymbolType:
        """Look up a registered symbol type. Raises :class:`NotFoundError` when
        the type is not registered."""
        symbol_type = self._types.get(type_)
        if symbol_type is None:
            msg = f"Unknown symbol type {type_!r}"
            raise NotFoundError(msg)
        return symbol_type

    def types(self) -> list[str]:
        return list(self._types)

    def validate_props(self, type_: str, raw: Mapping[str, Any]) -> BaseModel:
        """Validate a symbol's raw ``props`` into its type's model.

        Every failure is an :class:`InvalidError` because this validates
        authored input: an unknown type here is a bad document, not a missing
        resource. The pydantic error is chained for the server log and kept out
        of the raised message.
        """
        try:
            symbol_type = self.get(type_)
        except NotFoundError as exc:
            msg = f"Unknown symbol type {type_!r}"
            raise InvalidError(msg) from exc
        try:
            return symbol_type.props_model.model_validate(dict(raw))
        except ValidationError as exc:
            msg = f"Invalid props for symbol type {type_!r}"
            raise InvalidError(msg) from exc

    def ports_of(
        self, symbol: Symbol, props: BaseModel | None = None
    ) -> Mapping[str, Port]:
        """The ports *symbol* actually has, before rotation.

        Almost always the type's own declaration; the collector is the one type
        that authors its ports per instance, so its props decide. Pass *props*
        when they have already been validated, so a caller doing both does not
        validate the same symbol twice.
        """
        symbol_type = self.get(symbol.type)
        if symbol_type.ports_from_props is None:
            # Read-only view: the registry is built once and shared by every
            # request, so handing out the stored dict would let one caller
            # change port resolution for every later document in the process.
            return MappingProxyType(dict(symbol_type.ports))
        if props is None:
            props = self.validate_props(symbol.type, symbol.props)
        return MappingProxyType(dict(symbol_type.ports_from_props(props)))

    def schemas(self) -> dict[str, dict[str, Any]]:
        """A JSON Schema per registered type, for the editor and the kit.

        The props schema carries the rest of the type's contract under vendor
        extensions, so footprint, ports, slots and inline capability have one
        definition instead of being restated on the frontend. Consumers that
        only validate props ignore the extra keys.
        """
        return {
            name: {
                **t.props_model.model_json_schema(),
                # Five types share the empty props model, so its own title
                # would label them all "NoProps" in a generated form.
                "title": name,
                "x-footprint": asdict(t.footprint) if t.footprint else None,
                "x-ports": {
                    p: {"offset": port.offset.model_dump(), "side": port.side}
                    for p, port in t.ports.items()
                },
                # A type whose ports come from props publishes none here; an
                # editor must read them off the instance instead of concluding
                # the symbol has no attachment points.
                "x-ports-authored": t.ports_from_props is not None,
                "x-slots": list(t.slots),
                "x-required-slots": sorted(t.required_slots),
                "x-inline": t.inline,
                "x-rotation-locked": t.rotation_locked,
            }
            for name, t in self._types.items()
        }


def collector_ports(props: CollectorProps) -> Mapping[str, Port]:
    """Turn each offset authored along a collector's bar into a cell offset."""
    return {
        name: Port(
            offset=Cell(x=port.offset, y=0)
            if props.axis == "x"
            else Cell(x=0, y=port.offset),
            side=port.side,
        )
        for name, port in props.ports.items()
    }


def build_default_registry() -> SymbolRegistry:
    """The types the committed plates use: the format spec's appendix, the
    hydronic set of the visual-language spec, the loop heater of the
    panoplie P&IDs, the motorised two-way valve of the hot-production view.

    Inline types declare no ports: their in and out follow the segment they sit
    on, so a pipe never names one as an endpoint. A slot is declared once the
    first plate that places the type shows it.
    """
    registry = SymbolRegistry()
    registry.register(
        SymbolType(
            type="heat_pump",
            footprint=Footprint(w=2, d=2),
            ports={
                "supply": Port(offset=Cell(x=1, y=1), side="+x"),
                "return": Port(offset=Cell(x=0, y=1), side="-x"),
            },
            slots=("state", "fault", "supply_temp", "power"),
        )
    )
    registry.register(
        SymbolType(
            type="tank",
            footprint=Footprint(w=1, d=2),
            ports={
                "primary_in": Port(offset=Cell(x=0, y=0), side="-x"),
                "primary_out": Port(offset=Cell(x=0, y=1), side="-x"),
                "dhw_out": Port(offset=Cell(x=0, y=0), side="+x"),
                "dhw_in": Port(offset=Cell(x=0, y=1), side="+x"),
            },
            slots=("temperature",),
            props_model=TankProps,
        )
    )
    registry.register(
        SymbolType(
            type="collector",
            footprint=None,
            rotation_locked=True,
            props_model=CollectorProps,
            ports_from_props=collector_ports,
        )
    )
    registry.register(
        SymbolType(
            type="mixing_valve",
            footprint=Footprint(w=1, d=1),
            ports={
                "hot_in": Port(offset=Cell(x=0, y=0), side="-x"),
                "cold_in": Port(offset=Cell(x=0, y=0), side="+y"),
                "out": Port(offset=Cell(x=0, y=0), side="+x"),
            },
            slots=("supply_temp",),
        )
    )
    registry.register(
        SymbolType(
            type="pump",
            footprint=Footprint(w=1, d=1),
            slots=("state", "speed"),
            inline=True,
        )
    )
    registry.register(
        SymbolType(
            type="valve_isolation",
            footprint=Footprint(w=1, d=1),
            slots=("state",),
            inline=True,
        )
    )
    registry.register(
        SymbolType(
            type="valve_check",
            footprint=Footprint(w=1, d=1),
            inline=True,
        )
    )
    registry.register(
        SymbolType(
            type="valve_control",
            footprint=Footprint(w=1, d=1),
            slots=("position",),
            inline=True,
        )
    )
    registry.register(
        SymbolType(
            type="link",
            footprint=Footprint(w=1, d=2),
            ports={
                "in": Port(offset=Cell(x=0, y=0), side="-x"),
                "out": Port(offset=Cell(x=0, y=1), side="-x"),
            },
            props_model=LinkProps,
        )
    )
    registry.register(
        SymbolType(
            type="plate_exchanger",
            footprint=Footprint(w=1, d=1),
            ports={
                "primary_in": Port(offset=Cell(x=0, y=0), side="-x"),
                "primary_out": Port(offset=Cell(x=0, y=0), side="+x"),
                "secondary_in": Port(offset=Cell(x=0, y=0), side="-y"),
                "secondary_out": Port(offset=Cell(x=0, y=0), side="+y"),
            },
        )
    )
    registry.register(
        SymbolType(
            type="expansion_vessel",
            footprint=Footprint(w=1, d=1),
            ports={"in": Port(offset=Cell(x=0, y=0), side="-x")},
        )
    )
    registry.register(
        SymbolType(type="air_separator", footprint=Footprint(w=1, d=1), inline=True)
    )
    registry.register(
        SymbolType(
            type="dirt_separator",
            footprint=Footprint(w=1, d=1),
            slots=("fault",),
            inline=True,
        )
    )
    registry.register(
        SymbolType(
            type="pump_double",
            footprint=Footprint(w=1, d=1),
            slots=("state",),
            inline=True,
        )
    )
    registry.register(
        SymbolType(
            type="energy_meter",
            footprint=Footprint(w=1, d=1),
            slots=("energy",),
            inline=True,
        )
    )
    registry.register(
        SymbolType(
            type="loop_heater",
            footprint=Footprint(w=1, d=1),
            slots=("state", "fault"),
            inline=True,
        )
    )
    return registry


__all__ = [
    "CollectorProps",
    "LinkProps",
    "NoProps",
    "SymbolRegistry",
    "TankProps",
    "build_default_registry",
]
