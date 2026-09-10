# Synoptic document format

- **Status**: Draft
- **Milestone**: M1 — Use cases, data and specs (Synoptique project)
- **Issues**: AGR-1184 (this spec), AGR-1160 (model and service), AGR-1161 (router and binding resolution), AGR-1162 (renderer), AGR-1164 (first plate, production-correct)
- **Plate**: [`synoptic/ecs-est.json`](synoptic/ecs-est.json) — the ECS Est plate written by hand in this format. It is the document AGR-1160 stores, AGR-1161 serves and AGR-1162 renders; it is not a throwaway fixture.
- **Out of scope**: the visual language (AGR-1156), the projection and depth ordering (AGR-1158), the editor (AGR-1165), anything the renderer decides from the document alone.

The document describes a plate; it never describes a drawing. Everything that is a rendering choice — screen coordinates, colours, stroke styles, fonts, arrow weights, what a stale value looks like — is derived by the renderer from the document plus the symbol kit, and is deliberately unexpressible here (see *What the format cannot express*).

## Decisions

1. **Cells are `{x, y, z}` integers, `z` defaulting to 0.** The depth sort key (AGR-1158) derives from the cell; a pipe that has to climb over a ballon or cross another pipe needs a `z`, and adding it later would mean rewriting every waypoint of every stored plate. A flat plate (`projection: "flat"`) uses the same document with `z` forced to 0, so one format serves plant rooms and distribution views alike.
2. **Footprint on the symbol type, `cell` + `rotation` on the instance.** A symbol drawn by the design pass has one correct size on the grid; letting instances resize it would fork the visual language plate by plate. `rotation` counts quarter turns about the origin cell because a pump along x and a pump along y are different isometric drawings — the kit ships both, the document picks one. The **collector** is the one exception: its length and its port positions are authored in `props`, since a bar serving three departures is not the same shape as one serving eight (Decision 12).
3. **A generic `bindings` map plus a per-type `props` bag**, rather than one per-type `config` model as dashboard widgets use. Four consumers must enumerate every binding on a plate without knowing symbol types: save-time resolution in the service, the live WebSocket subscription, the fault list scoped to the view, and the editor's binding picker. A widget gets away with one `config` because it has one target; a PAC panel has four. The slot names a type declares are a contract: an unknown slot is an authoring error.
4. **A slot binding is an `AttributeTarget` and must resolve to exactly one device.** `AttributeTarget` (`packages/models/src/models/targets.py`) is kept so the existing `CompositeTargetResolver` and the target picker of the chart widget are reused unchanged. The resolver today refuses zero devices and mixed data types but is happy with nine; the synoptics service, given the API's resolver at construction, adds the "exactly one" rule at save time. A `space_agg` to fold a set is additive later; allowing sets now with no fold rule would be a silent guess in production.
5. **Units and decimals live on the binding.** `Attribute` carries no unit, and the standard schemas do not either, so the document is the only place "°C, one decimal" can be said. They are authoring data; the locale rendering (`52,4 °C`) is the renderer's.
6. **Slot values are a two-arm union, `attribute` or `text`.** A panel row such as `DESSERTE · 104 chambres` is a row of the same panel as `DÉBIT`; rendering it as a free label parked next to the panel breaks the moment the panel moves. The `text` arm is reserved for facts no device exposes — a hardcoded `55 °C` is a review defect, not a format feature.
7. **An explicit, optional `device_id` on the symbol** is the sole source of click-through and of the fault badge. Deriving the device from the bindings would open the iSMA controller when the user clicks ballon B01, because the ballon's temperature comes from the controller and the ballon has no device of its own. `Device.is_faulty` is per device, so the badge and the view-scoped fault list (AGR-1163) need to know what a symbol *is*, not what it *reads*. A symbol with no `device_id` has no click and no badge.
8. **Symbols can be placed on a pipe.** Valves, check valves, pumps, meters and sensors sit *in* a run; modelling each as a node with its own in/out ports would split the PAC 03 departure into four pipes for two valves. An inline placement `{pipe, cell}` puts the symbol at a cell of the run, rotation following the segment; the pipe stays one pipe. The type registry says which types are inline-capable. Inline symbols keep their `id`, `bindings` and `device_id` like any other, so the enumeration of Decision 3 does not care.
9. **A pipe endpoint may be a symbol port, a free cell, or a cell on another pipe.** The third form is the tee the mermaid POC could not draw ("pas de vrai piquage en T"). No junction symbol type is needed: the renderer draws the branch point, the editor snaps a pipe end onto a run. Reference cycles between pipes are refused; chains are fine.
10. **Tags are readings riding on a pipe** at a cell of its run, with a label (`TT-05`, `CL-03`) and an optional bound value. This is the "edge labels are the natural home for instrument readings" lesson of the POC. Instrumentation that only reads is a tag; equipment that changes the fluid path is a symbol.
11. **Fluid is a closed vocabulary owned by the format; colour is owned by the design pass.** The renderer keys its palette on the fluid; the document never names a colour. The v1 vocabulary is hydronic. Air ducts and single-line conductors (AGR-1167, AGR-1168) will reuse `pipes` with new values when those plates come — additive, not a redesign.
12. **The collector's ports are authored**: `props.length`, and for each port its offset along the bar and the side it faces. Inlets and outlets are not on opposite faces in general — the return collector of the plate takes its inlets from the north and lets its outlet out west, along the bar. The type declares the port *naming* (`in_<n>`, `out_<n>`); the instance declares where they are. `rotation` must be 0 on a collector: `props.axis` already says which way the bar runs, and having both would let them disagree.
13. **Folio links and off-plate boundaries are one `link` symbol type.** A P&ID off-page connector is the same shape whether or not the other page exists in the system. `props.synoptic_id` set: clicking navigates. Unset: an inert labelled boundary (`EAU FROIDE`). The target's existence is **not** validated at save time — the first plate links to plates that do not exist yet — and a link whose target was deleted renders inert with a visible "missing" state rather than breaking the plate.
14. **Flow animation is an explicit bool binding on the pipe**, not inferred from a pump in the run. The renderer animates a pipe whose `flow` resolves to `true`; a pipe without `flow` is static. Inferring from an inline pump would animate the return of a loop whose pump is on the supply, and would have no answer for a pipe fed by two PACs (see *cannot express*).
15. **Element ids are author-chosen slugs, unique across the whole document** (symbols, pipes, tags and labels share one namespace). Pipes reference symbols and other pipes by id, so ids must exist in the authored file, and `pac-03` reviews better than a 16-hex string. The editor generates ids; the document id itself is service-assigned with `gen_id()` as every entity.
16. **No `style`, `color`, `width`, `dashed` or `z_index` field anywhere.** The POC needed a dashed line for its folio stub; here the stub is a `link` symbol and the renderer decides how a pipe into a link looks. Draw order is derived from cells (AGR-1158); the order of arrays in the document carries no meaning.
17. **Staleness threshold is authoring data.** A ballon temperature refreshed every ten minutes and a pump state refreshed every second do not go stale at the same age. `defaults.stale_after` on the document, `stale_after` on a binding overrides it, the service's own default applies when neither is set — one definition per level, never duplicated in the renderer.
18. **Text in the document is literal, not i18n keys.** A plate is authored by Agrid for one customer, in that customer's language. Product chrome around the plate is translated as usual; the plate is not.

## Document envelope

| Field | Type | Description |
|---|---|---|
| `version` | `1` | Format version. Bumped only on a breaking change; additive fields do not bump it. |
| `name` | `str` | Display name, e.g. `Production ECS Est`. |
| `description` | `str \| null` | Free text. |
| `projection` | `"isometric" \| "flat"` | How cells are projected. `flat` requires every `z` to be 0. |
| `defaults.stale_after` | `int \| null` | Seconds after which an unrefreshed value renders stale, unless a binding overrides it. |
| `symbols` | `Symbol[]` | Equipment, instruments and links. |
| `pipes` | `Pipe[]` | Runs between ports, cells and other pipes. |
| `labels` | `Label[]` | Free-placed text. |

The stored document adds `id` (service-assigned) and `metadata {created_at, updated_at}`, exactly as `Dashboard` does. The committed plate is the import/create payload and carries neither.

## Coordinates

| Type | Shape | Used by |
|---|---|---|
| `Cell` | `{x: int, y: int, z: int = 0}` | Symbol origin, pipe waypoints and endpoints, tag positions, inline placements. |
| `Point` | `{x: float, y: float, z: float = 0}` | Label positions only. Labels are free-placed, so they may sit between cells. |

Conventions the renderer and the kit agree on, stated here so a plate can be written by hand:

- `x` runs to the right-and-down of the isometric view, `y` to the left-and-down, `z` up. In a flat plate `x` is screen-right and `y` screen-down.
- A symbol at `cell` with footprint `w × d` covers `[x, x + w) × [y, y + d)` at rotation 0. Rotation `r` turns the footprint and the port offsets by `r` quarter turns counter-clockwise about the origin cell, in the xy plane.
- A port is `{offset: Cell, side}` declared by the type (or by `props` for a collector): the cell of the footprint the pipe attaches to, and the face it leaves through — one of `+x -x +y -y +z -z`. The pipe's polyline starts *at* the port cell; the renderer draws from the symbol's edge.

## Symbols

| Field | Type | Description |
|---|---|---|
| `id` | `str` | Slug, `^[a-z0-9][a-z0-9_-]{0,63}$`, unique across the document. |
| `type` | `str` | A registered symbol type (see the appendix for the ones this plate uses). |
| `placement` | `Placement` | Where the symbol sits — see below. |
| `label` | `str \| null` | The tag drawn with the symbol: `PAC 03`, `B01`, `V-03`. |
| `device_id` | `str \| null` | The device this symbol *is*. Click-through and fault badge; nothing else. |
| `props` | `object` | Type-specific static configuration, validated by the type's model. `{}` when the type has none. |
| `bindings` | `{slot: SlotValue}` | One entry per slot the type declares; slots not listed render empty. |

`Placement` is a discriminated union:

| `kind` | Fields | Meaning |
|---|---|---|
| `cell` | `cell: Cell`, `rotation: 0 \| 1 \| 2 \| 3` | Free-standing on the grid. |
| `pipe` | `pipe: str`, `cell: Cell` | Inline on a run, at a cell of that pipe's polyline (endpoints excluded). Only inline-capable types. Rotation follows the segment. |

## Slot values

Used by symbol `bindings`, tag `value`, label `value` and pipe `flow`.

| `kind` | Fields | Meaning |
|---|---|---|
| `attribute` | `target: AttributeTarget`, `unit: str \| null`, `decimals: int \| null`, `labels: {str: str} \| null`, `stale_after: int \| null` | A live value. `target` must resolve to exactly one device. `labels` maps the stringified raw value to display text (`{"true": "MARCHE", "false": "ARRÊT"}`), for bool, string and int attributes. `decimals` only with numeric attributes. |
| `text` | `text: str` | A literal, for facts no device exposes. |

`AttributeTarget` is `{devices: {ids?, types?, tags?}, attribute}` unchanged. A hand-written plate uses `ids: ["<device id>"]`; the editor may write any filter the picker produces, as long as it resolves to one device.

## Pipes

| Field | Type | Description |
|---|---|---|
| `id` | `str` | Slug, unique across the document. |
| `fluid` | `Fluid` | `primary_supply`, `primary_return`, `dhw`, `dhw_loop`, `cold_water`, `heating_supply`, `heating_return`, `chilled_supply`, `chilled_return`, `condenser_supply`, `condenser_return`. |
| `from` | `Endpoint` | Where the flow starts. |
| `to` | `Endpoint` | Where the flow ends. The renderer draws the arrow here. |
| `waypoints` | `Cell[]` | Intermediate corners. The polyline is `from-cell, waypoints…, to-cell`. |
| `flow` | `SlotValue \| null` | `attribute` arm, bool. `true` animates the run. |
| `tags` | `Tag[]` | Readings riding on the run. |

`Endpoint` is a discriminated union:

| `kind` | Fields | Meaning |
|---|---|---|
| `port` | `symbol: str`, `port: str` | A port of a symbol; the endpoint cell is the port's cell. |
| `cell` | `cell: Cell` | A free cell (a run that starts or ends in the open). |
| `pipe` | `pipe: str`, `cell: Cell` | A tee: a cell on another pipe's polyline. |

`Tag`:

| Field | Type | Description |
|---|---|---|
| `id` | `str` | Slug, unique across the document. |
| `at` | `Cell` | A cell on the pipe's polyline. |
| `label` | `str` | `TT-05`, `FT-01`, a line code. |
| `value` | `SlotValue \| null` | The reading; a line code has none. |

## Labels

| Field | Type | Description |
|---|---|---|
| `id` | `str` | Slug, unique across the document. |
| `at` | `Point` | Free position. |
| `text` | `str` | Literal. |
| `role` | `"title" \| "caption" \| "note"` | What the text is, so the kit can size it. Not a style. |
| `value` | `SlotValue \| null` | Optional reading shown with the text, for a value that belongs to no symbol and no pipe (an outdoor temperature in a corner). |

## Save-time rules

Enforced by the service and its type registry (AGR-1160); rule 9 needs the device manager, so the service runs it through the `TargetResolver` the API injects at construction (AGR-1161). Every violation is reported at once as one `SchemaValidationError` carrying `{loc, msg, type}` items, never a blank tile in production.

1. `version` is 1.
2. Every `id` matches the slug pattern and is unique across symbols, pipes, tags and labels.
3. `symbol.type` is registered; `props` validates against the type's model; every `bindings` key is a slot the type declares; every slot the type marks required is bound.
4. A `cell` placement has `rotation` in 0..3; a collector has `rotation` 0. A `pipe` placement names an existing pipe, a type flagged inline-capable, and a cell strictly inside that pipe's polyline.
5. A `port` endpoint names an existing symbol and a port its type (or its collector `props`) declares. A `pipe` endpoint names an existing pipe other than itself and a cell on that pipe's polyline; the graph of pipe-to-pipe references has no cycle.
6. The polyline `from-cell, waypoints…, to-cell` has at least two distinct cells; consecutive cells differ in exactly one axis (axis-aligned segments only, `z` included).
7. The first segment leaves a `port` endpoint through the port's side; the last segment arrives at a `port` endpoint through its side.
8. `fluid` is in the vocabulary. `projection: "flat"` implies every `z` is 0.
9. Every `attribute` slot value resolves, through the `TargetResolver`, to exactly one device exposing the attribute. `flow` resolves to a bool. `decimals` is only set when the resolved data type is numeric.
10. A `link` symbol's `synoptic_id` is *not* checked for existence (Decision 13).

What is deliberately **not** a rule: pipes may share cells (a tee shares one by construction, two runs crossing at different `z` share an xy). The editor helps the author see overlaps; the format does not forbid them.

## What the format cannot express

Written down so nobody adds it by accident. Each is either a rendering concern the document must stay clear of, or a capability that would be additive later.

- **Screen coordinates, sizes, colours, stroke styles, fonts, dash patterns, draw order.** All derived. A plate that looks wrong is fixed in the kit or the projection, never by a field in the document.
- **Diagonal or curved pipes.** Segments are axis-aligned, `z` included. The kit rounds corners; the document does not know.
- **Per-instance symbol size.** Only the collector has a length, in cells.
- **A value computed from several attributes**: no averages over the nine ballons, no sum of two meters, no unit conversion, no threshold colouring. A slot shows one attribute of one device, formatted. Adding `space_agg` to the `attribute` arm would be the additive path.
- **Flow as an OR.** The primary return loop of the plate runs when PAC 03 *or* PAC 04 runs; a `flow` binding names one attribute, so that pipe stays static. Found while writing the plate; acceptable in v1 since both PACs feed the same collector and the supply pipes animate individually.
- **Writes, commands, setpoints.** Read-only by project decision.
- **Groups, layers, frames, nested synoptics, conditional visibility.** The ballon bay is nine tanks and thirty pipes, not a group; a caption label says "9 × 500 L".
- **Historical values.** A binding has no time. The renderer's value hook takes an optional timestamp (AGR-1162); the document is unchanged by it.
- **Alarm thresholds.** Faults come from the device's fault attributes and `is_faulty`; the plate only says which device a symbol is.
- **Deep links into an element of another plate.** A link targets a plate.
- **Anything off-plate.** Where cold water comes from, where the 104 rooms are: a `link` boundary and nothing more.
- **Translations.** Text is literal (Decision 18).

## The plate: `synoptic/ecs-est.json`

The mermaid POC's *Production ECS Est* (`poc/mermaid-ecs-est/` in the gallery repo) rewritten with positions: two PAC, a supply collector with departures, nine 500 L ballons in three columns, a return collector, the mitigeur, the ECS departure to the 104 rooms, the bouclage with its pump, cold water make-up, and a folio link to a sibling plate. Plan view of the grid, `z` up, one cell ≈ one metre:

```
 y=-6  PRODUCTION ECS EST (title)
 y=-3            [DHW collector x=11..21] --TT-05-- [MIT 24] --FT-01-- [DIST 30]
 y=-2  overhead feed col.3 (z=1)              bouclage <- P-BCL <- TT-06 <-┘ (y=-2)
 y=-1  overhead feed col.2 (z=1)                                  │ x=25
 y= 0  [PAC 03] TT V CL -> [C]-> B01     B02     B03              │
 y= 3     x=0-1           x=5   B04     B05     B06              │
 y= 4  [PAC 04] TT V CL ->      B07     B08     B09              │
 y= 6           [ECS OUEST link x=8]   x=10    x=14    x=18      │
 y=10           cold water main  <--------------------------------┴-- [EAU FROIDE 30]
 y=13  [return collector x=3..17] <- column returns (hop over y=10 at z=1)
 x=-1  primary return loop up to PAC 03, tee to PAC 04
```

Primary flows top-down through each column (`B01 → B04 → B07`, west lane), domestic water bottom-up (`B07 → B04 → B01`, east lane), columns in parallel between the two collectors. That topology is plausible for a stratified bay and is what AGR-1164 checks against the GTB drawing; it is not verified.

### The shapes the issue asked to confront

| Shape | How the format holds it | Where in the plate |
|---|---|---|
| Collector with departures | One `collector` symbol, four outlets authored in `props.ports`, one per column plus one to the ECS Ouest link. Outlets two and three leave overhead (`z = 1`) so they clear the domestic-water risers. | `collector-primary-supply`, pipes `feed-col-*`, `feed-ecs-ouest` |
| Drawn return loop | The POC amputated it into a folio stub. Here `primary-return-loop` runs from the return collector west and north to PAC 03, and `primary-return-pac-04` tees off it. Positions make the cycle a non-event. | `primary-return-loop`, `primary-return-pac-04` |
| Device with a standard synoptic | `pac-03.device_id` names an `awhp`; AGR-1163 resolves the standard entry from `device.type`. The format needs nothing beyond `device_id`. | `pac-03` |
| Tee | Three forms: a pipe branching off a pipe (`primary-return-pac-04`), a branch feeding a run at both ends (`dhw-loop-to-storage`, pipe-to-pipe), cold-water risers off the main. | `cold-col-2`, `cold-col-3`, `dhw-loop-to-storage` |
| Crossing | Column 2 and 3 returns hop over the cold-water main at `z = 1`; the overhead feeds cross the risers the same way. | `col-2-return`, `col-3-return` |
| Inline equipment | Isolation and check valves on each PAC departure, the bouclage pump on the return, all inline. | `v-03`, `cl-03`, `p-bcl` |
| Readings on the run | `TT-03/04` on the PAC departures, `TT-05` on the ECS departure, `TT-06` on the bouclage, `FT-01` on the distribution supply. | `pipes[].tags` |
| Folio link and boundary | `link-ecs-ouest` navigates (placeholder id); `link-distribution` and `link-cold-water` are boundaries. | `link-*` |

### Bindings inventory

Every live value on the plate, which is also the point inventory AGR-1155 needs for this view. Device ids are **placeholder tokens** (`PAC-03`, `PAC-04`, `ECS-EST-CTRL`), attribute names on the controller are **guesses** in the AWHP naming style; AGR-1164 replaces them. The API will refuse to import the plate until it does, which is the intended save-time check.

| Element | Slot / tag | Device | Attribute | Format |
|---|---|---|---|---|
| `pac-03`, `pac-04` | `state` | PAC | `onoff_state` (AWHP standard) | MARCHE / ARRÊT |
| | `fault` | PAC | `general_fault` (not in the AWHP standard — confirm) | DÉFAUT / NORMAL |
| | `supply_temp` | PAC | `outlet_temperature` (standard) | °C, 1 |
| | `power` | PAC | `active_power` (not in the standard — confirm, may be a separate meter) | kW, 1 |
| `tt-03`, `tt-04` | value | PAC | `outlet_temperature` | °C, 1 |
| `v-03`, `v-04` | `state` | controller | `valve_03_open`, `valve_04_open` | OUVERTE / FERMÉE |
| `b01` … `b09` | `temperature` | controller | `tank_01_temperature` … `tank_09_temperature` | °C, 0 |
| `mitigeur` | `supply_temp` | controller | `mixed_supply_temperature` | °C, 1 |
| `tt-05` | value | controller | `dhw_departure_temperature` | °C, 1 |
| `tt-06` | value | controller | `dhw_loop_return_temperature` | °C, 1 |
| `ft-01` | value | controller | `dhw_flow_rate` | m³/h, 1 |
| `p-bcl` | `state` | controller | `loop_pump_running` | MARCHE / ARRÊT |
| pipes `pac-0x-supply`, `feed-*` | `flow` | PAC | `onoff_state` | bool |
| pipes `dhw-loop-*` | `flow` | controller | `loop_pump_running` | bool |

### What writing the plate taught about the format

- **Moving a symbol drags the pipe ends attached to its ports, and nothing else.** Waypoints, tags, inline placements and tees are absolute cells. Spreading the distribution corner by two cells meant editing one symbol origin and four absolute cells, and no pipe endpoint. This is the right split — a port-attached end has no independent position — but it is what the editor (AGR-1165) has to make invisible.
- **Isometric crowds at one-cell spacing.** A pump, a tag and a link one cell apart collide in a crude 2:1 projection. The kit's minimum spacing between inline elements is a design-pass output (AGR-1156), and the checker for this spec cannot know it; the plate leaves two cells between anything that carries text.
- **A collector with `n` outlets is `n` pipes, each routed by hand.** The overhead departures needed five waypoints apiece. That is the cost the editor is meant to remove, and the reason the format does not try to route.
- **Thirty-four pipes for one bay is the honest count**, not a symptom. Nine tanks with two fluids in counter-flow between four collectors have that many runs on the real drawing too.

### Open points for AGR-1164

- Which device each placeholder is, and whether the PACs are `awhp`-typed on `okko-paris-la-defense`.
- Whether the ballons are piped as drawn.
- Whether `fault` and `power` exist on the PAC devices or belong to a meter.
- Whether the plant has the energy counters the old GTB showed; the format has no `energy_meter` on this plate because the POC had none, and the type is a registry addition, not a format change.

## Appendix — symbol types used by the plate

Input for the registry (AGR-1160) and the kit (AGR-1156, AGR-1159). Footprints are `w × d` at rotation 0; port offsets are relative to the origin cell.

| Type | Footprint | Inline | Ports (offset, side) | Slots | Props |
|---|---|---|---|---|---|
| `heat_pump` | 2 × 2 | no | `supply` (1,1,+x), `return` (0,1,−x) | `state`, `fault`, `supply_temp`, `power` | — |
| `tank` | 1 × 2 | no | `primary_in` (0,0,−x), `primary_out` (0,1,−x), `dhw_out` (0,0,+x), `dhw_in` (0,1,+x) | `temperature` | `capacity: str` |
| `collector` | 1 × `length` along `axis` | no | authored: `ports: {name: {offset: int, side}}`, names `in_<n>` / `out_<n>` | — | `axis: "x" \| "y"`, `length: int ≥ 2`, `ports` |
| `mixing_valve` | 1 × 1 | no | `hot_in` (0,0,−x), `cold_in` (0,0,+y), `out` (0,0,+x) | `supply_temp` | — |
| `pump` | 1 × 1 | yes | `in`, `out` (from the segment when inline) | `state` | — |
| `valve_isolation` | 1 × 1 | yes | `in`, `out` | `state` | — |
| `valve_check` | 1 × 1 | yes | `in`, `out` | — | — |
| `link` | 1 × 2 | no | `in` (0,0,−x) flow leaving the plate, `out` (0,1,−x) flow entering it | — | `synoptic_id: str \| null`, `caption: str \| null` |

No slot is required on any of these types in v1: a panel with fewer bound rows is a smaller panel, the same rule the shipped AHU synoptic applies to its coils.
