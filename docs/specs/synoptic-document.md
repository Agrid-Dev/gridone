# Synoptic document format

- **Status**: Draft
- **Milestone**: M1 — Use cases, data and specs (Synoptique project)
- **Issues**: AGR-1184 (this spec), AGR-1160 (model and service), AGR-1161 (router and binding resolution), AGR-1162 (renderer), AGR-1164 (first plate, production-correct)
- **Plates**: [`synoptic/example-dhw.json`](synoptic/example-dhw.json) and [`synoptic/example-heating.json`](synoptic/example-heating.json), two fictional plates written in this format (see *The example plates*). They are the documents the format's, the renderer's and the editor's tests run on; a site's plates live on its instance.
- **Out of scope**: the visual language (AGR-1156), the projection and depth ordering (AGR-1158), the editor (AGR-1165), anything the renderer decides from the document alone.

The document describes a plate; it never describes a drawing. Everything that is a rendering choice — screen coordinates, colours, stroke styles, fonts, arrow weights, what a stale value looks like — is derived by the renderer from the document plus the symbol kit, and is deliberately unexpressible here (see *What the format cannot express*).

## Decisions

1. **Cells are `{x, y, z}` integers, `z` defaulting to 0.** The depth sort key (AGR-1158) derives from the cell; a pipe that has to climb over a ballon or cross another pipe needs a `z`, and adding it later would mean rewriting every waypoint of every stored plate. A flat plate (`projection: "flat"`) uses the same document with `z` forced to 0, so one format serves plant rooms and distribution views alike.
2. **Footprint on the symbol type, `cell` + `rotation` on the instance.** A symbol drawn by the design pass has one correct size on the grid; letting instances resize it would fork the visual language plate by plate. `rotation` counts quarter turns about the origin cell because a pump along x and a pump along y are different isometric drawings — the kit ships both, the document picks one. The **collector** is the one exception: its length and its port positions are authored in `props`, since a bar serving three departures is not the same shape as one serving eight (Decision 12).
3. **A generic `bindings` map plus a per-type `props` bag**, rather than one per-type `config` model as dashboard widgets use. Four consumers must enumerate every binding on a plate without knowing symbol types: save-time resolution in the service, the live WebSocket subscription, the fault list scoped to the view, and the editor's binding picker. A widget gets away with one `config` because it has one target; a PAC panel has four. The slot names a type declares are a contract: an unknown slot is an authoring error.
4. **A slot binding is an `AttributeTarget` and must resolve to exactly one device.** `AttributeTarget` (`packages/models/src/models/targets.py`) is kept so the existing `CompositeTargetResolver` and the target picker of the chart widget are reused unchanged. The resolver today refuses zero devices and mixed data types but is happy with nine; the synoptics service, given the API's resolver at construction, adds the "exactly one" rule at save time. A `space_agg` to fold a set is additive later; allowing sets now with no fold rule would be a silent guess in production.
5. **Units and decimals live on the binding.** `Attribute` carries no unit, and the standard schemas do not either, so the document is the only place "°C, one decimal" can be said. They are authoring data; the locale rendering (`52,4 °C`) is the renderer's.
6. **Slot values are a two-arm union, `attribute` or `text`.** A panel row such as `DESSERTE · 120 chambres` is a row of the same panel as `DÉBIT`; rendering it as a free label parked next to the panel breaks the moment the panel moves. The `text` arm is reserved for facts no device exposes — a hardcoded `55 °C` is a review defect, not a format feature.
7. **An explicit, optional `device_id` on the symbol** is the sole source of click-through and of the fault badge. Deriving the device from the bindings would open a controller when the user clicks tank `b01`, because the tank's temperature comes from the controller and the tank has no device of its own. `Device.is_faulty` is per device, so the badge and the view-scoped fault list (AGR-1163) need to know what a symbol *is*, not what it *reads*. A symbol with no `device_id` has no click and no badge. A twin pump is two machines drawn as one: it carries no `device_id` (saving one is refused, `device_per_head`) and each head names its own in `props.heads`, so each head is its own click and its own badge; the two may be two devices or the same controller read through two sets of points.
8. **Symbols can be placed on a pipe.** Valves, check valves, pumps, meters and sensors sit *in* a run; modelling each as a node with its own in/out ports would split the PAC 03 departure into four pipes for two valves. An inline placement `{pipe, cell}` puts the symbol at a cell of the run, rotation following the segment; the pipe stays one pipe. The type registry says which types are inline-capable. Inline symbols keep their `id`, `bindings` and `device_id` like any other, so the enumeration of Decision 3 does not care.
9. **A pipe endpoint may be a symbol port, a free cell, or a cell on another pipe.** The third form is the tee the mermaid POC could not draw ("pas de vrai piquage en T"). No junction symbol type is needed: the renderer draws the branch point, the editor snaps a pipe end onto a run. Reference cycles between pipes are refused; chains are fine.
10. **Tags are readings riding on a pipe** at a cell of its run, with a label (`TT-05`, `CL-03`) and an optional bound value. This is the "edge labels are the natural home for instrument readings" lesson of the POC. Instrumentation that only reads is a tag; equipment that changes the fluid path is a symbol.
11. **Fluid is a closed vocabulary owned by the format; colour is owned by the design pass.** The renderer keys its palette on the fluid; the document never names a colour. The v1 vocabulary is hydronic. Air ducts and single-line conductors (AGR-1167, AGR-1168) will reuse `pipes` with new values when those plates come — additive, not a redesign.
12. **The collector's ports are authored**: `props.length`, and for each port its offset along the bar and the side it faces. Inlets and outlets are not on opposite faces in general — the return collector of the plate takes its inlets from the north and lets its outlet out west, along the bar. The type declares the port *naming* (`in_<n>`, `out_<n>`); the instance declares where they are. `rotation` must be 0 on a collector: `props.axis` already says which way the bar runs, and having both would let them disagree.
13. **Folio links and off-plate boundaries are one `link` symbol type.** A P&ID off-page connector is the same shape whether or not the other page exists in the system. `props.synoptic_id` set: clicking navigates. Unset: an inert labelled boundary (`EAU FROIDE`). The target's existence is **not** validated at save time — the first plate links to plates that do not exist yet — and a link whose target was deleted renders inert with a visible "missing" state rather than breaking the plate.
14. **Flow is an explicit bool binding on the pipe, and it sets its circuit going.** Nothing is inferred from a pump in the run: that would move the return of a loop whose pump is on the supply. The one exception is a twin pump on a run with no `flow` of its own: the pair has no point saying it runs and either head may be the one running, so the run flows while a head reads on (the production plates' pump branches). A run whose `flow` resolves to `true` circulates, and so does every run on a path of the fluid through it. A path goes the way runs are drawn (`from` → `to`): into the run a run ends on or that starts on it (a tee), and through a symbol from a run arriving on a port to the runs leaving by a port of the same passage (the registry's `passages`, see the appendix: a heat pump's return to its supply, a tank's primary and domestic sides apart, every port of a collector). The fluid enters where a run starts in the open or on a passage nothing arrives at on the plate, and leaves where one ends in the open or on a passage nothing leaves by. Where runs simply join (a tee, a collector) they carry one fluid: a run of another fluid there is a feed or a changeover crossover, not the circuit. No path enters a run whose own `flow` is `false`, one on which a machine or valve that gates the flow (`gates_flow`) reads off, or one ending on a port in no passage (a dead end); such a machine reading off at a run's end closes its passage. So a loop fed by two PACs runs when either does, with no binding naming both, and a branch whose supply valve is closed stays still by its return too. The renderer draws circulation in the isometric view only (visual language, Decision 8).
15. **Element ids are author-chosen slugs, unique across the whole document** (symbols, pipes, tags and labels share one namespace). Pipes reference symbols and other pipes by id, so ids must exist in the authored file, and `pac-03` reviews better than a 16-hex string. The editor generates ids; the document id itself is service-assigned with `gen_id()` as every entity.
16. **No `style`, `color`, `width`, `dashed` or `z_index` field anywhere.** The POC needed a dashed line for its folio stub; here the stub is a `link` symbol and the renderer decides how a pipe into a link looks. Draw order is derived from cells (AGR-1158); the order of arrays in the document carries no meaning.
17. **Staleness threshold is authoring data.** A ballon temperature refreshed every ten minutes and a pump state refreshed every second do not go stale at the same age. `defaults.stale_after` on the document, `stale_after` on a binding overrides it, the service's own default applies when neither is set — one definition per level, never duplicated in the renderer.
18. **Text in the document is literal, not i18n keys.** A plate is authored by Agrid for one customer, in that customer's language. Product chrome around the plate is translated as usual; the plate is not.

## Document envelope

| Field | Type | Description |
|---|---|---|
| `version` | `1` | Format version. Bumped only on a breaking change; additive fields do not bump it. |
| `name` | `str` | Display name, e.g. `Exemple ECS`. |
| `description` | `str \| null` | Free text. |
| `projection` | `"isometric" \| "flat"` | How cells are projected. `flat` requires every `z` to be 0. |
| `defaults.stale_after` | `int \| null` | Seconds after which an unrefreshed value renders stale, unless a binding overrides it. |
| `symbols` | `Symbol[]` | Equipment, instruments and links. |
| `pipes` | `Pipe[]` | Runs between ports, cells and other pipes. |
| `labels` | `Label[]` | Free-placed text. |

The stored document adds `id` (service-assigned) and `metadata {created_at, updated_at}`, exactly as `Dashboard` does. A plate file is the import/create payload and carries neither.

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
| `label` | `str \| null` | The tag drawn with the symbol: `PAC 03`, `V-03`; null for a symbol the drawing leaves unnamed (the ballons). |
| `device_id` | `str \| null` | The device this symbol *is*. Click-through and fault badge; nothing else. Null on a twin pump, whose heads name theirs in `props.heads`. |
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
| `flow` | `SlotValue \| null` | `attribute` arm, bool. `true` sets the run and its circuit going (Decision 14). |
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
- **A value computed from several attributes**: no averages over the nine tanks, no sum of two meters, no unit conversion, no threshold colouring. A slot shows one attribute of one device, formatted. Adding `space_agg` to the `attribute` arm would be the additive path.
- **Writes, commands, setpoints.** Read-only by project decision.
- **Groups, layers, frames, nested synoptics, conditional visibility.** A tank bay is nine tanks and their pipes, not a group; a caption label says "9 × 500 L". A dashed box around a pump group on a source drawing is the same non-thing: four heads on four branches.
- **Historical values.** A binding has no time. The renderer's value hook takes an optional timestamp (AGR-1162); the document is unchanged by it.
- **Alarm thresholds.** Faults come from the device's fault attributes and `is_faulty`; the plate only says which device a symbol is.
- **Deep links into an element of another plate.** A link targets a plate.
- **Anything off-plate.** Where cold water comes from, where the rooms are: a `link` boundary and nothing more.
- **Translations.** Text is literal (Decision 18).

## The example plates

Two fictional plates show the format at full size: [`synoptic/example-dhw.json`](synoptic/example-dhw.json), a hot-water bay, and [`synoptic/example-heating.json`](synoptic/example-heating.json), a heating production. Their names and device ids are invented, so they bind nothing on a real instance; they are what the format's suite, the renderer's and the editor's specs and the kit's plate sheet run on. A site's own plates are deployment data: they live on its instance, pushed through the API or drawn in the editor, and are versioned with that site's integration, never here.

### The hot-water bay: `synoptic/example-dhw.json`

Two heat pumps, a supply collector, nine 500 L tanks in three columns of three, the departure off the top of the bay through a booster pump and a mixing valve to the distribution, the recirculation back into the bay through a twin loop pump and a loop heater, and a return collector to the heat pumps with the cold-water make-up on it. One water circuit: the heat pumps heat the sanitary water directly, so there is no exchanger. Hot water enters the top of each column (`primary_in`, the tank type's port name for its upper inlet), works down it (`b01 → b04 → b07`) and leaves the bottom tank to the return collector; the departure is taken off the top tanks (`dhw_out`), and the recirculation returns into `b03.dhw_in`. Fluids key the palette by circuit role, not by medium: the production loop is `primary_supply` / `primary_return`, the departure `dhw`, the recirculation `dhw_loop`, the make-up `cold_water`. The tanks carry no `label`: the storage caption names the bay, and the ids are only the pipes' handles.

| Shape | How the format holds it | Where in the plate |
|---|---|---|
| Collector with departures | One `collector` symbol, outlets authored in `props.ports`. The column-2 feed leaves overhead (`z = 1`) so it clears the column-1 departure riser. | `collector-supply`, pipes `feed-col-*` |
| Drawn return loop | `return-loop` runs from the return collector west and north to PAC 01, and `return-pac-02` tees off it. Positions make the cycle a non-event. | `return-loop`, `return-pac-02` |
| Device with a standard synoptic | `pac-01.device_id` names the heat pump; the detail page resolves the standard entry from `device.type` when the device has one, else opens the device panel. The format needs nothing beyond `device_id`. | `pac-01` |
| Tee | A pipe branching off a pipe (`return-pac-02`), and a branch leaving an overhead run for a port (`feed-col-3` off `feed-col-2`). | `return-pac-02`, `feed-col-3` |
| Crossing | The overhead feed of column 2 crosses the column-1 departure riser at `z = 1`; nothing else meets at grade outside a tee (`validation.overlaps` lists such cells for the editor; the plate keeps its list empty). | `feed-col-2` |
| Inline equipment | A manual isolation valve on each heat pump departure (drawn, unbound); the booster pump, the twin loop pump and the loop heater. | `v-01`, `v-02`, `pompe-surpression`, `pompe-bouclage`, `rechauffeur-boucle` |
| Readings on the run | `DÉPART` on the mixing valve's outlet and `RETOUR` on the recirculation, each a `text` slot saying it is not measured. | `tt-depart`, `tt-retour` |
| Marked, not guessed | The loop pump's heads and the loop heater carry `text` slots ("non identifiée") where no device is known to read them, rather than a guessed binding (Decision 6). | `pompe-bouclage`, `rechauffeur-boucle` |
| Folio link and boundary | `link-distribution`, `link-cold-water` and `link-efa` (rotated a quarter turn so its outlet faces the mixing valve) are boundaries. | `link-*` |

### The heating production: `synoptic/example-heating.json`

A district primary on a plate exchanger, regulated by a control valve on the primary return next to a heat meter; a secondary loop through an air separator and two twin pumps in parallel; a supply collector feeding four circuits, two of them change-over circuits with a cold leg on each side; a return collector, a dirt separator on a side loop of the return, the expansion vessel and the make-up water. Each circuit is a departure off the supply collector, a riser, a jog along `x` into a `link` and a return jog back, the return riser dropping to the return collector past the supply bar at `z = 1` and carrying the circuit's meter, then its control valve. The twin pumps sit on two parallel branches between a trunk and a merge column; each head names its own device, and the branches carry no flow of their own, the twin sets its branch going while a head runs (Decision 14).

### What authoring the first plates taught

- **Moving a symbol drags the pipe ends attached to its ports, and nothing else.** Waypoints, tags, inline placements and tees are absolute cells. This is the right split (a port-attached end has no independent position), and it is what the editor has to make invisible.
- **Isometric crowds at one-cell spacing.** A pump, a tag and a link one cell apart collide in the 2:1 projection; the plates leave two cells between anything that carries text.
- **A collector with `n` outlets is `n` pipes.** Twenty-four pipes for a nine-tank bay is the honest count, not a symptom.
- **An overhead run one step back lands on the run at grade.** In the 2:1 projection a cell at `z = 1` lands where the cell one step back on both axes lands at grade, so a third collector outlet routed overhead along the row behind the departure collector painted straight over it; the third column is fed by a tee off the column-2 overhead feed instead.
- **A collector's obstacle is its cells, not its bounding box.** A long bar spans a box that is mostly empty plate; the renderer stands a bar as one box per cell, so readouts can sit under or over it.
- **A panel on an inline symbol needs room the 2:1 projection does not give on a lattice.** A run climbs at slope 1/2 through the corner spots of the readout search, so an inline twin pump with two bound slots takes the spot below its body and needs the next parallel branch further than that: seven rows between branches, and columns further than the panel reaches.
- **A tag on a riser has no spot**, nor has a readout on a riser two columns from another riser. Circuit temperatures ride the jogs along `x` at the top of each riser, and the change-over circuits' return temperature rides its riser between the two collectors, where nothing stands near.
- **Two links per change-over block.** A `link` has one inlet and one outlet a cell apart; the cold supply joins the hot supply riser and the cold return leaves the hot return riser two columns away, so one link would cross a riser. Each leg has its own link.
- **A link that leads to another plate is a pipe with one direction across the two.** A plate file names no target: a synoptic id is the instance's, so links between plates are pointed at each other on the instance once both are pushed. A push replaces the whole document, so a tool that pushes a plate file copies the stored plate's targets onto the links of the same id first.
- **A symbol's name goes through the same readout search as its readings** (`placement.ts`); a name at a fixed lift above the body landed on runs where every chip and panel was kept clear.
- **A tee needs its target run first.** A run drawn before the run it should tee onto ends on a bare cell, which the format reads as two runs meeting at grade, not a tee (AGR-1368).
- **Pan or scale.** A plate is wider than a laptop content area; the renderer scales it to fit its container, then pans by drag and zooms with a modifier wheel or a pinch. The first view is the whole plate, small, and the operator zooms in.

## Authoring in 2D (AGR-1437)

The editor was rebuilt after the first plates were authored in it; what it now does, as far as the format is concerned:

- **Always on the plan.** The editor draws the flat projection whatever the document says; `projection` stays the view operators open the plate on, chosen when the plate is created and in its settings. A flat plate refuses every depth (`flat_depth`), so the editor offers no height there and keeps "plan" off the settings while anything is raised.
- **Height is a run's, not a symbol's.** The pipe tool draws the points a run passes by on the floor or overhead (z = 1); the router adds the risers. No example plate raises a symbol, so no field does; a symbol keeps the z it has.
- **Runs follow their symbols.** An edit that moves a port (a move, a turn, a collector's direction, cell or face) re-routes the runs attached to that port and no other. A run keeps its far part from a **pin**: the first cell another run tees onto, counted from the moved end, else its second bend when it has three or more, else it is routed whole. The new part reaches the pin in line with what is kept; inline symbols and tags that fell off it go back onto the new part, in order. When that breaks a run rule, the old run is kept whole and stretched from the old port cell; when that breaks one too, the edit is refused, as is any edit that puts a body on another. The rules are the backend's run rules, mirrored in the UI (`runRules.ts`), and held to `validate_document` on 1137 documents with the same verdicts. Automatic routes avoid stationary pipes at the same height and reserve the paths already chosen for other moving pipes. Only the relevant pair may share an explicit tee or port cell. The final document, including fallback paths, may keep existing overlaps but may not add overlapping cells. On the two example plates, every symbol with a run moved by up to three cells each way or turned: 1061 edits taken (5 by stretching), 56 refused for body overlaps, and 500 refused because no acceptable route was found (`reroute.spec.ts` pins the counts per plate). Every accepted result is checked for new run violations, snags and overlaps; both input documents remain unchanged, including after refusals.
- **Inline types ride a run only**, on a cell strictly inside it and not at the foot or head of a riser; dropped from the library, one snaps to the nearest unoccupied such cell. Sliding retains the symbol's own cell and cannot stack it on another inline symbol. Duplication searches the same eight positions, skipping footprints occupied by bodies, pipes or inline symbols in the plan.
- **Device first.** A symbol takes its `device_id`, then each slot an attribute of that device, written `ids: [<device>]` as every plate does; picking another device moves those bindings to it. A reading from another device, or a literal, stays possible. An incomplete choice of another device stays in the inspector: the stored binding is kept until a non-empty attribute is chosen, when its replacement becomes one undoable step. Switching symbols, sources, or bindings through undo/redo discards the draft.
- **Checks before saving**, never in its way: what the last save refused, runs the rules would refuse, symbols with slots but no device and no binding, incomplete attribute bindings, and pipe overlaps at the same height. Overlap warnings name both pipes and lead to either one; manually drawn overlaps remain saveable.
- **Still by hand**: creating tags, free labels and the title label, readable ids (the editor still numbers `pump-2`), and turning a run's bare-cell end into a tee (AGR-1368).

## Appendix — symbol types of the hydronic kit

Input for the registry (AGR-1160) and the kit (AGR-1156, AGR-1159); the example plates place all of them but `valve_check`. The double pump reads per head, since one speed for two heads would be a number for neither: heads `a` and `b` each have a `state`, a `fault` and a `speed` (`state_a`, `fault_a`, `speed_a`, then `_b`), published per head under `x-heads`, and each names its own device in `props.heads`. Footprints are `w × d` at rotation 0; port offsets are relative to the origin cell.

| Type | Footprint | Inline | Ports (offset, side) | Slots | Props |
|---|---|---|---|---|---|
| `heat_pump` | 2 × 2 | no | `supply` (1,1,+x), `return` (0,1,−x) | `state`, `fault`, `supply_temp`, `power` | — |
| `tank` | 1 × 2 | no | `primary_in` (0,0,−x), `primary_out` (0,1,−x), `dhw_out` (0,0,+x), `dhw_in` (0,1,+x) | `temperature` | `capacity: str` |
| `collector` | 1 × `length` along `axis` | no | authored: `ports: {name: {offset: int, side}}`, names `in_<n>` / `out_<n>` | — | `axis: "x" \| "y"`, `length: int ≥ 2`, `ports` |
| `mixing_valve` | 1 × 1 | no | `hot_in` (0,0,−x), `cold_in` (0,0,+y), `out` (0,0,+x) | `supply_temp` | — |
| `pump` | 1 × 1 | yes | `in`, `out` (from the segment when inline) | `state`, `speed` | — |
| `valve_isolation` | 1 × 1 | yes | `in`, `out` | `state` | — |
| `valve_check` | 1 × 1 | yes | `in`, `out` | — | — |
| `valve_control` | 1 × 1 | yes | `in`, `out` | `position` | — |
| `link` | 1 × 2 | no | `in` (0,0,−x) flow leaving the plate, `out` (0,1,−x) flow entering it | — | `synoptic_id: str \| null`, `caption: str \| null` |
| `plate_exchanger` | 1 × 1 | no | `primary_in` (0,0,−x), `primary_out` (0,0,+x), `secondary_in` (0,0,−y), `secondary_out` (0,0,+y) | — | — |
| `air_separator` | 1 × 1 | yes | `in`, `out` | — | — |
| `expansion_vessel` | 1 × 1 | no | `in` (0,0,−x) | — | — |
| `dirt_separator` | 1 × 1 | yes | `in`, `out` | `fault` | — |
| `pump_double` | 1 × 1 | yes | `in`, `out` | `state_a`, `fault_a`, `speed_a`, `state_b`, `fault_b`, `speed_b` | `heads: {a?, b?: {device_id: str \| null}}` |
| `energy_meter` | 1 × 1 | yes | `in`, `out` | `energy` | — |
| `loop_heater` | 1 × 1 | yes | `in`, `out` | `state`, `fault` | — |

**Passages and gates** (`x-passages`, `x-gates-flow` in the published schemas), what the fluid passes between inside each type, for circulation (Decision 14): `heat_pump` return to supply, and it gates; `tank` its primary pair and its domestic pair, apart; `collector` every authored port (`"all"`), for the runs of one fluid; `mixing_valve` its three ports; `link` `in` and `out`; `plate_exchanger` its primary and secondary pairs, apart; `expansion_vessel` none, a dead end. Inline types sit on their run and pass it through; `pump`, `pump_double` and `valve_isolation` gate it, the double pump only once both heads read off (the standby head takes over when the duty head stops), `loop_heater` does not (off, it stops heating, not the loop).

No slot is required on any of these types in v1: a panel with fewer bound rows is a smaller panel, the same rule the shipped AHU synoptic applies to its coils.
