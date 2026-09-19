# Synoptic document format

- **Status**: Draft
- **Milestone**: M1 — Use cases, data and specs (Synoptique project)
- **Issues**: AGR-1184 (this spec), AGR-1160 (model and service), AGR-1161 (router and binding resolution), AGR-1162 (renderer), AGR-1164 (first plate, production-correct)
- **Plates**: [`synoptic/ecs-est.json`](synoptic/ecs-est.json), the ECS Est plate written by hand in this format, [`synoptic/ecs-ouest.json`](synoptic/ecs-ouest.json), the Ouest bay of the same installation, and [`synoptic/production-chaud.json`](synoptic/production-chaud.json), the hot production that feeds the building's heating circuits. They are the documents AGR-1160 stores, AGR-1161 serves and AGR-1162 renders; none is a throwaway fixture.
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
| `label` | `str \| null` | The tag drawn with the symbol: `PAC 03`, `V-03`; null for a symbol the drawing leaves unnamed (the ballons). |
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
- **A value computed from several attributes**: no averages over the seven ballons, no sum of two meters, no unit conversion, no threshold colouring. A slot shows one attribute of one device, formatted. Adding `space_agg` to the `attribute` arm would be the additive path.
- **Flow as an OR.** The primary return loop of a plate runs when PAC 03 *or* PAC 04 runs (PAC 01 or PAC 02 on the Ouest plate), and the hot production's trunk runs when any of four pump heads does; a `flow` binding names one attribute, so those pipes stay static. Found while writing the plate; acceptable in v1 since the machines feed the same collector and their own runs animate individually.
- **Writes, commands, setpoints.** Read-only by project decision.
- **Groups, layers, frames, nested synoptics, conditional visibility.** A ballon bay is seven or nine tanks and their pipes, not a group; a caption label says "7 × 500 L" or "9 × 500 L". The old GTB's dashed box around the hot production's pump group is the same non-thing: four heads on four branches.
- **Historical values.** A binding has no time. The renderer's value hook takes an optional timestamp (AGR-1162); the document is unchanged by it.
- **Alarm thresholds.** Faults come from the device's fault attributes and `is_faulty`; the plate only says which device a symbol is.
- **Deep links into an element of another plate.** A link targets a plate.
- **Anything off-plate.** Where cold water comes from, where the rooms are: a `link` boundary and nothing more.
- **Translations.** Text is literal (Decision 18).

## The plate: `synoptic/ecs-est.json`

The mermaid POC's *Production ECS Est* (`poc/mermaid-ecs-est/` in the gallery repo) rewritten with positions, then corrected against the old GTB drawing "Production ECS - Chambre Est": two heat pumps, a supply header, seven 500 L ballons in three columns (three, three and one), the ECS departure off the top of the bay through the surpression pump and the mitigeur to the distribution, the bouclage back into the bay through its pump and its loop heater, and a return header to the heat pumps with the cold-water make-up on it; the distribution corner is the panoplie P&ID's, which the GTB view does not draw. Plan view of the grid, `z` up, one cell ≈ one metre:

```
 y=-6  PRODUCTION ECS EST (title)                                   DISTRIBUTION (x=29)
 y=-3            [DHW collector x=11..21] -- P.SURPRESSION 23 -- [MIT 26] -- DÉPART 31 -- [DIST 32]
 y=-2                                        [EFA 25, rot 1] -> ┘ x=26      RETOUR 29 ----┘ (y=-2)
 y=-1  overhead feed col.2 (z=1)                                              │ x=28
 y= 0  [PAC 03] V  ->      [C]-> b01     b02                                  │
 y= 4  [PAC 04] V  ->      x=5   b04     b05 <-- RÉCHAUFFEUR (24,5) <-- P.BOUCLAGE (28,4)
 y= 8     x=0-1                 b07     b08 --> b09
 y= 9                                  x=10    x=14    x=18      [EAU FROIDE 32]
 y=10                                                            STOCKAGE, COMPTEUR (x=20)
 y=13  [return collector x=3..18] <- column returns <- cold make-up x=31
 x=-1  return loop up to PAC 03, tee to PAC 04
```

One water circuit, as drawn: the heat pumps heat the sanitary water directly, so there is no exchanger and no separate heating loop. Hot water enters the top of columns 1 and 2 (`primary_in`, the tank type's port name for its upper inlet), works down the column (`b01 → b04 → b07`), leaves the bottom tank to the return header and back to the heat pumps; the seventh ballon (`b09`, bottom right) is where the drawing's single outlet leaves the bay, so it is fed along the bottom row from `b08` and drains to the return header, with no feed or departure of its own; the departure is taken off the top tanks of columns 1 and 2 (`dhw_out`); the bouclage returns into the middle of the bay (`b05.dhw_in`, where the drawing's arrow enters) through its pump and its loop heater, the mitigeur's cold inlet is fed by eau froide adoucie, and the cold make-up joins the return header. Fluids key the palette by circuit role, not by medium: the production loop (heat pumps to bay and back) is `primary_supply` / `primary_return`, the departure `dhw`, the bouclage `dhw_loop`, the make-up `cold_water`, the grammar the visual language keeps from the POC. The drawing shows the bay as a block fed at the top left, drained at the bottom right and entered by the bouclage on the right, without per tank piping, so the plate keeps those three connections where the drawing has them and the series-per-column reading inside the bay is the POC's, which the drawing neither confirms nor contradicts. The tank count and arrangement, the single circuit and the manual valve on each PAC departure are the drawing's. The GTB view draws no panoplie, but the two room panoplie P&IDs ("Départ EC 104 Chambres" and "Départ EC 80 Chambres", identical in layout; which one this bay serves is unconfirmed, so the distribution link carries no room count) are a source of truth alongside it, and the GTB's PLOMBERIE view lists a *Synthèse Défauts Pompe Bouclage* for the 3500 L station. The plate draws the panoplie as the Ouest plate does (see its section): `pompe-surpression` on the departure, `pompe-bouclage` and `rechauffeur-boucle` inline on the loop return, which ends in `b05`, `link-efa` into the mitigeur's `cold_in`, the pump's and the heater's states marked "non identifiée" until the station's pair is known. The same P&IDs put the two temperature sensors on the départ ECS after the mitigeur and on the retour ECS before the pump, which is where the plate's `DÉPART` and `RETOUR` tags sit; the tanks carry the same text there, "Ballon ECS Q TON 500L", and no name or number, so no tank carries a `label`: the STOCKAGE caption names the bay, and the ids are only the pipes' handles.

### The shapes the issue asked to confront

| Shape | How the format holds it | Where in the plate |
|---|---|---|
| Collector with departures | One `collector` symbol, two outlets authored in `props.ports`, one per fed column. The second leaves overhead (`z = 1`) so it clears the column-1 departure riser. | `collector-supply`, pipes `feed-col-*` |
| Drawn return loop | The POC amputated it into a folio stub. Here `return-loop` runs from the return collector west and north to PAC 03, and `return-pac-04` tees off it. Positions make the cycle a non-event. | `return-loop`, `return-pac-04` |
| Device with a standard synoptic | `pac-03.device_id` names the PAC device; the detail page resolves the standard entry from `device.type` when the device has one (the PAC devices are untyped, so they open the device panel). The format needs nothing beyond `device_id`. | `pac-03` |
| Tee | A pipe branching off a pipe (`return-pac-04`); the Ouest plate adds a branch leaving an overhead run for a port (`feed-col-3`). | `return-pac-04` |
| Crossing | The overhead feed of column 2 crosses the column-1 departure riser at `z = 1`; nothing else on the plate meets at grade outside a tee (`validation.overlaps` lists such cells for the editor; the plate keeps its list empty). | `feed-col-2` |
| Inline equipment | A manual isolation valve on each PAC departure (drawn, unbound); the panoplie's two pumps and its loop heater, the last two with marked states. | `v-03`, `v-04`, `pompe-surpression`, `pompe-bouclage`, `rechauffeur-boucle` |
| Readings on the run | `DÉPART` on the mitigeur's outlet and `RETOUR` on the bouclage return, the drawing's Température Départ / Retour, each a `text` slot saying it is not measured. | `tt-depart`, `tt-retour` |
| Folio link and boundary | `link-distribution`, `link-cold-water` and `link-efa` (rotated a quarter turn so its outlet faces the mitigeur) are boundaries. The drawing reaches the Ouest plate through a navigation button, not an off-page connector, so no folio link is placed on either plate; the index is the navigation between them. | `link-*` |

### Bindings inventory

Every live value on the plate, bound to the instance's devices by their ids. The rule: a point is bound only if the source drawing shows it and a device exposes it. What the drawing shows but no device exposes carries a `text` slot that says so (Decision 6), so the gap is marked rather than silently missing.

| Element | Slot / tag | Device | Attribute | Format |
|---|---|---|---|---|
| `pac-03`, `pac-04` | `state` | `schneider_pac_qton3` / `_qton4` | `onoff_state` | MARCHE / ARRÊT |
| | `fault` | same | `fault` | DÉFAUT / NORMAL |
| pipes `pac-0x-supply` | `flow` | same | `onoff_state` | bool |
| `cpt-ballon-est` (label) | value | `schneider_cpt_ballon_est` | `energy` | Wh, 0. The unit is inferred: the driver declares none; the GTB's meter pages show every counter in kWh with the site's meters between 10^5 and 10^6 kWh, so 237 794 000 reads as Wh (237 794 kWh) and cannot be kWh. The format does not scale, so the chip is nine digits wide; open point. |
| `tt-depart`, `tt-retour` | value | none | mitigeur départ / retour (the PLOMBERIE view's Température Aller / Retour): the `wago_ss1_ecs` registers have read 0 since June, the gateway's S3/S4 record a single 0 | `text`, "non mesurée" |
| `pompe-bouclage` | `state` | none yet | read by `isma_mix38_chaufferie` as one of three pump pairs, the pair unknown | `text`, "non identifiée" |
| `rechauffeur-boucle` | `state`, `fault` | none yet | read by `isma_mix38_chaufferie` as one of two heaters, which unknown | `text`, "non identifiée" |

Not on the GTB view nor the P&ID, so dropped rather than integrated: per tank temperature, PAC outlet temperature and power, isolation valve states, the distribution flow meter, the PLOMBERIE view's *Etat Mitigeur*, the P&ID's thermomètres, manomètres, balancing and purge valves, clapets and manchette témoin (instrumentation and manual gear with no device, and no room for them at the two-cell text pitch), and the Charot gateway's S1 / SP probes (live, but nothing ties that controller to this bay; its tanks are another model). The ballon energy counter is an electricity meter, not a heat meter in the water loop, so it is a caption label carrying the reading rather than an inline `energy_meter`. The PAC `alarm` (synthèse défaut) is a fault attribute, surfaced by the view-scoped fault list through the PAC symbols' `device_id`, not by a slot. The meter's `defaut_ballon` / `alarme_ballon` are not: the meter is bound through a label, and a label carries no `device_id`, so the view's fault list does not reach it.

### What writing the plate taught about the format

- **Moving a symbol drags the pipe ends attached to its ports, and nothing else.** Waypoints, tags, inline placements and tees are absolute cells. Spreading the distribution corner by two cells meant editing one symbol origin and four absolute cells, and no pipe endpoint. This is the right split — a port-attached end has no independent position — but it is what the editor (AGR-1165) has to make invisible.
- **Isometric crowds at one-cell spacing.** A pump, a tag and a link one cell apart collide in a crude 2:1 projection. The kit's minimum spacing between inline elements is a design-pass output (AGR-1156), and the checker for this spec cannot know it; the plate leaves two cells between anything that carries text.
- **A collector with `n` outlets is `n` pipes, each routed by hand.** The overhead departure needed five waypoints. That is the cost the editor is meant to remove, and the reason the format does not try to route.
- **Twenty-one pipes for one bay is the honest count**, not a symptom. Seven tanks, two columns fed, chained and drained by their own runs and a seventh ballon fed along the row, plus the three headers, the departure, the bouclage, the make-up and the EFA into the mitigeur, are that many runs.

### Answered by the first live plate

- PAC 03/04 are `schneider_pac_qton3` / `_qton4`, split from the AS-B panel, untyped (not `awhp`). They expose `onoff_state`, `fault`, `alarm` and nothing else: no outlet temperature, no power.
- The old GTB view shows seven ballons all labelled "Ballon ECS Q TON 500L", no name and no per ballon value; the bay is drawn, not read, and its single outlet leaves the bottom-right ballon.
- The energy counter exists (`schneider_cpt_ballon_est.energy`) on an electricity meter; it is bound on a label, and `energy_meter` still declares no slot.
- The mitigeur départ / retour has no live source on the instance. Both ride their runs as tags carrying a `text` slot reading "non mesurée" until the probes read.
- The heat pumps heat the sanitary water directly (one circuit on the drawing, cold make-up on the return to the heat pumps); the POC's primary loop and counter-flow lanes were a generic stratified bay, not this plant.
- Pan or scale: the plate is wider than a laptop content area, and the renderer scales it to fit its container, then pans by drag and zooms with a modifier wheel or a pinch (`PidDiagram`). The first view is the whole plate, small, and the operator zooms in.

## The second plate: `synoptic/ecs-ouest.json`

The old GTB drawing "Production ECS - Chambre Ouest" is the Est drawing's template: the same two heat pumps with a state and a fault row each, the same manual valve on each departure, the same crossover of supply riser and return trunk, the same mitigeur panel at 0 °C, the same départ leaving the top of the bay and bouclage entering its right side, the same cold make-up on the return. It differs in three places, and the plate differs only there:

- **PAC 01 and PAC 02** are `schneider_pac_qton1` / `_qton2`, paired by number as PAC 03 / 04 were (no site document names the pairing). QTON 1 reads all three objects (BI4, BI5, BV23); QTON 2 has no timeseries on any of its three (BI6, BI7, BV24 on the same controller): the device reports `current_value: false` for each, unchanged since the device was created on 2026-09-04, and every poll refreshes `last_updated` without a point ever being stored. Its rows are bound as PAC 03's were on the first plate, and the panel reads ARRÊT / NORMAL, which the plate cannot tell from a real stop; the read fix is AGR-1185's.
- **Nine ballons in three columns of three** (`b01` to `b09`, the Est grid with its two gaps filled). The third column is fed by a tee off the column-2 overhead feed at `(13, -1, z = 1)`, running on along `y = -1` and dropping into `b03`, and the departure collector takes a third inlet. A third collector outlet routed overhead along `y = -2` was tried first: in the 2:1 projection a cell at `z = 1` lands where the cell one step back on both axes lands at grade, so that run painted straight over the departure collector's row. Each column is chained and drains on its own; the Est bay's row feed of its seventh ballon has no counterpart here.
- **The bouclage enters the right ballon of the top row** (`b03.dhw_in`, where the drawing's arrow enters), the loop return dropping at `x = 28` to `y = 1` with the same pump and heater on it.

- **The panoplie is drawn, from the P&ID**, on both plates. The two room panoplie sheets ("Départ EC 104 / 80 Chambres") are a source of truth alongside the GTB view, which draws none of the panoplie: on the retour ECS a *pompe de bouclage EC* then a *réchauffeur de boucle* before the water goes back to the tanks (never to the mitigeur), on the départ a *pompe de surpression* before the *mitigeur électronique*, whose cold inlet is the *départ EFA* (eau froide adoucie); a second EFA branch into the return to production is the GTB's make-up. So `pompe-surpression` sits inline on `dhw-departure`, `pompe-bouclage` and `rechauffeur-boucle` (the `loop_heater` type, added for this) inline on `dhw-loop-return`, which now ends in the bay, and `link-efa` (rotated a quarter turn so its outlet faces the mitigeur) feeds `mitigeur.cold_in`; the distribution corner sits two cells further right than it first did, on both plates, to hold the surpression pump at the two-cell text pitch. The pump and the heater are read by the iSMA controller (`pompe_1_1 … pompe_3_2`, `rechauffeur_1 / 2`), but nobody has said which pair or which heater serves this station, so their `state` (and the heater's `fault`) is a `text` slot "non identifiée" until that is known, never a guessed pair; the surpression pump has no device at all. The P&ID's thermomètres, manomètres, balancing and purge valves, clapets and manchette témoin stay off the plate: no device, and no room at the text pitch. Two simplifications against the sheet are deliberate and the same on both plates: the réchauffeur is drawn inline on the return where the sheet puts it on a branch whose two isolation valves are drawn closed (the controller can still switch it on, so its state matters; its valve positions do not reach any device), and the sheet's recirculation branch from the return up into the départ after the mitigeur is not drawn (a real pipe, but the plate shows equipment and readings, not every path the water can take). The Est plate carries the same corner.

The bay caption says "STOCKAGE · 9 × 500 L" and no litre total: the GTB's PLOMBERIE view names the site's three stations 3500L, 4000L and RESTAURANT, the Est bay is the 3500L one (7 × 500 L) and the restaurant has its own production, so this bay is the 4000L station by elimination, and nine drawn ballons make 4 500 L. Until the site says which figure is right, the caption carries the count the drawing shows. The distribution link carries no room count for the same reason as on the first plate.

### Bindings inventory

| Element | Slot / tag | Device | Attribute | Format |
|---|---|---|---|---|
| `pac-01`, `pac-02` | `state` | `schneider_pac_qton1` / `_qton2` | `onoff_state` | MARCHE / ARRÊT |
| | `fault` | same | `fault` | DÉFAUT / NORMAL |
| pipes `pac-0x-supply` | `flow` | same | `onoff_state` | bool |
| `cpt-ballon-ouest` (label) | value | `schneider_cpt_ballon_ouest` | `energy` | Wh, 0; the same inference as the Est meter, whose register it mirrors (22 199 000 raw on 2026-09-17, moving in whole thousands) |
| `tt-depart`, `tt-retour` | value | none | the 4000L station's départ / retour: `wago_ss1_ecs.ecs_4000l_temp_depart` / `_temp_recyclage` read a single 0 on 2026-06-25, the gateway's S3 / S4 are not fitted | `text`, "non mesurée" |
| `pompe-bouclage` | `state` | none yet | read by `isma_mix38_chaufferie` as one of three pump pairs, the pair unknown | `text`, "non identifiée" |
| `rechauffeur-boucle` | `state`, `fault` | none yet | read by `isma_mix38_chaufferie` as one of two heaters, which unknown | `text`, "non identifiée" |

Dropped for the same reason as on the first plate: the PACs' `alarm` (a fault attribute, reached through `device_id`), the QTON 1-2 electricity meter, everything on the ballon meter but `energy`, the iSMA dry contacts (`ballon_ouest_auto` / `_commande`; the pump pairs and loop heaters are drawn but marked until the station's pair is known), the PLOMBERIE view's 4000L rows (`synthese_defaut_armoire`, `synthese_defaut_pompes_bouclage`, `mitigeur`), the Charot gateway's probes.

### What the second plate answered

- The template repeats: against the Est plate, two tanks and a collector inlet are added, four pipes are added (the column-3 feed and departure, two chain links) and one is removed (the row feed of the Est bay's seventh ballon); 24 pipes for a nine-tank bay is the honest count for the same reason as twenty-one is.
- The renderer draws both plates from the same test (`SynopticRenderer.spec.tsx`), which also checks that no run is drawn along another run or along a collector bar, the overlay the projection makes possible; the format's suite (`test_plates.py`) holds every committed plate to the same probes, and each plate's own file to what its drawing decides: the two plates bind disjoint devices, the tags project onto distinct screen columns (`x - y` differs), every tank is fed exactly once, the Ouest caption carries no total.
- A `link` between the two bays is still not placed: the GTB's "Vue Production ECS CH EST / OUEST" buttons are navigation, and the synoptics index is that navigation.


## The third plate: `synoptic/production-chaud.json`

The old GTB drawing "PRODUCTION CHAUD" is the first view off the hot-water template: a district primary ("Depuis Bâtiment D") on the plate exchanger ECH EC04, regulated by a motorised valve on the primary return next to the heat meter; a secondary loop through an air separator and two twin pumps PEC-D2 / PEC-D3 in parallel; a supply collector feeding four circuits (ECS cuisine, change-over VCV RdC, CTA / radiateur / RAC, change-over VCV chambres) and a return collector; a dirt separator and the expansion vessel VEC 04 on the return, with a leg from the cold production joining at the vessel. The same VEC 04 is drawn on the "PRODUCTION FROID" view, so that leg is read as the pressure-balance line the two circuits share, a reading the drawing neither confirms nor denies. No P&ID of the sub-station exists in the project folder; the GTB view and its counter page are the only drawings. Plan view of the grid, `z` up:

```
 y=-25  [trunk top 16] ------- PEC-D2 A (22) ------------- [merge top 28]
 y=-20  PRESSION 16 (suction D2)                            PRESSION 28 (discharge D2, y=-19)
 y=-18  (16) ----------------- PEC-D2 B (22) ------------- (28)
 y=-11  (16) ----------------- PEC-D3 A (22) ------------- (28)
 y= -6  PRESSION 16 (suction D3)                            PRESSION 28 (discharge D3)
 y= -4  (16) ----------------- PEC-D3 B (22) ------------- (28)
 y= -3  [ECH 10] -- DÉPART 12 -- SÉPARATEUR 14 -- (16,-3)   (28,-3) --> [supply collector 30..68]
 y= -1  [LINK -1] ==== DÉPART 4 ==== overhead 9..12 ==> (12,0)   departures at xs = 32, 44, 56, 68
 y=  0  [LINK -1] <-- M 2 <-- CPT 4 <-- RETOUR 6 <-- [ECH 10]    each riser up to a jog on row -14 into a link at xs+6
 y=  2  [ECH 10] <-- MANQUE D'EAU 14 <-- vase tee 24 <-- POT À BOUE 27 <-- [return collector 30..70]
 y=  4        [EG link 19] --> (24,3) tee     [VEC 04 at 24]     returns at xs+2, meter at row -11, over the bar at z=1
        change-over blocks: valves at (xs,-5), (xs,-7), (xs+2,-7); cold legs on row -9 from a link at xs-8 and to a link at xs+10
```

The primary enters the exchanger's `primary_in` and leaves its `primary_out` on the opposite face (the type's ports), so the exchanger sits at rotation 2 with its return running straight west to the link and its supply looping round to the east face, crossing the secondary's column overhead. The four heads are four `pump` symbols on four parallel branches of twelve cells, seven rows apart, between a trunk column and a merge column: the trunk ends where the top branch starts and the other three tee off it, every branch ends on the merge column, and the merge feeds the supply collector. Each circuit is a departure off the supply collector, a riser, a jog along `x` into a `link` and a return jog back, the return riser dropping to the return collector past the supply bar at `z = 1`. The two change-over circuits add the crossover the view draws: a second valve on the hot supply riser, one on the hot return riser, and a cold leg on each side to its own "VERS PRODUCTION EG" link, each through a valve. The old GTB's counter page names the counters (CPT-EC-ECH-04, CPT-EC-ECS CUISINE, CPT-EC-VCO, CPT-EC-CTA, CPT-EC-CHAMBRES), so the meters carry those names; the circuit meters sit on the return risers above the change-over tee, where the flow is the circuit's own, as the primary's meter sits on the primary return. The valves the view draws unnamed carry no name (a label would also replace the control valve's `M` mark), the bars carry no text, and the captions are the view's own words.

### Bindings inventory

| Element | Slot / tag | Device | Attribute | Format |
|---|---|---|---|---|
| `pompe-pec-d2-a` … `pompe-pec-d3-b` | `state` | `schneider_pompe_pec_e2a` / `_e2b` / `_e3a` / `_e3b` | `onoff_state` | MARCHE / ARRÊT |
| | `speed` | same | `speed` | tr/min, 0 |
| pipes `pec-*-branch` | `flow` | same | `onoff_state` | bool |
| `cpt-ec-ech-04` | `energy` | `schneider_heat_meter_ec` | `energie` | Wh, 0. Inferred as the ballon meters' unit was: the driver declares none, the GTB's counter page showed CPT-EC-ECH-04 at 1 065 434 kWh on 2025-11-06 and the register read 1 311 988 992 on 2026-09-18, ten months and 246 555 kWh later. Ten raw digits on the chip; the register arrives as a BACnet float, quantised in its last digits. |
| `tt-primaire-depart`, `tt-primaire-retour` | value | same meter | `tmpdepart`, `tmpretour` | °C, 1 |
| `tt-secondaire-depart` | value | `schneider_prod_divers` | `echec_tmpdepart` | °C, 1 |
| `tt-manque-eau` | value | same | `ec04_defmanqueeau` (BI7) | NORMAL / DÉFAUT, on the return under the separator where the view draws the switch |
| `pot-a-boue` | `fault` | same | `ec04_defpotboue` (BI9) | NORMAL / DÉFAUT. The pot has no `device_id` (it is no device), so its glyph never takes the fault outline; its chip, like the MANQUE D'EAU tag's, follows `is_faulty` of the controller device it reads, so both frame red whenever any of that device's seven fault contacts is up, even while they read NORMAL |
| `pression-pec-*` (4) | value | the four pump heads | `head` | bar, 1, one tag on each head's branch. The view draws one dial above and one below each twin; the cold view's lower dial reads 65.5 bar, the stopped head's `head` register (the drive's 0xFFFF sentinel), so the dials are the heads' own differential head, not a suction and a discharge. Displayed raw, sentinel included; decoding the sentinel to null is the driver's job, not a plate's |
| `v-primaire` | `position` | none | the view's "Signal 93 %": no device exposes the valve's output, only its setpoint | `text`, "non mesurée" |
| `tt-cuisine-*`, `tt-cta-*`, `tt-vcv-*-retour` (6) | value | none | no device reads these circuit temperatures | `text`, "non mesurée" |
| `cpt-cuisine`, `cpt-vcv-rdc`, `cpt-cta`, `cpt-vcv-chambres` | `energy` | none | the counter page's CPT-EC-ECS CUISINE / VCO / CTA / CHAMBRES: on the controller's mirror before the 2026-09-04 split, on no device since | `text`, "non mesurée" |
| `v-cuisine`, `v-cta` | `state` | none | no end switch for these two circuit valves | `text`, "non mesurée" |
| `tt-vcv-rdc-depart`, `tt-vcv-chambres-depart`, the ten `v-vcv-*` valves | value, `state` | not yet | `schneider_circuits_ec_eg` reads two change-over departures (`vc_tmpdepart`, `vcv_tmpdepart`) and two pairs of valve end switches (`vcec_*`, `vceg_*`, `vcvec_*`, `vcveg_*`), and nothing says which of `vc` and `vcv` is the RdC circuit; both read the same value in cooling mode | `text`, "non identifiée" |

Not on the view, so dropped rather than integrated: the heat meter's `puissance`, `debit`, `volume` and `deltat`; the pumps' flow, current, hours, starts, frequency, warnings and control registers; the pump electricity meters; the sub-station's discordance and cabinet alarms, the pump group fault (`ec04_defgmp`) and the alarm copies of the two bound contacts (`alamanqueeauec`, `alapotboueec`); the controller's setpoints and curves; everything of the cold production; the cabinet AEL-04E. None of those faults reaches the view's fault list: no symbol on the plate *is* one of the controller devices (Decision 7), and the exchanger has no device of its own; the four pumps and the heat meter are the plate's devices.

### What the third plate taught

- **A collector's obstacle is its cells, not its bounding box.** A bar of thirty cells drawn across the plate spans a box of about 1200 × 600 px that is mostly empty plate, and the renderer, which kept readouts off every body's box, could place nothing under or over it; the bays' shorter bars never showed it. The renderer now stands a bar as one box per cell, and its spec pins a tag hanging below its run under such a bar.
- **A panel on an inline symbol needs room the 2:1 projection does not give on a lattice.** A run climbs at slope 1/2 through the corner spots of the readout search, so an inline pump with two bound slots (a 164 × 78 px panel) takes the spot below its body, three gaps out, and needs the next parallel branch further than that: seven rows between branches, and columns further than the panel reaches, twelve cells. The manifold's size is that cost, not the plant's.
- **A tag on a riser has no spot.** Above a `y`-run lies the parallel riser two columns back, below it the run's own next piece, so the circuit temperatures ride the jogs along `x` at the top of each riser, as the bays' tags ride their `x`-runs.
- **Two links per change-over block.** A `link` has one inlet and one outlet a cell apart; the cold supply joins the hot supply riser and the cold return leaves the hot return riser two columns away, so one link would cross a riser. Each leg has its own link, as the bays' cold water has.
- **A readout on a riser two columns from another riser has no corner spot either**: the neighbour passes 80 px left and 40 px up of every cell, into the top-left ring. The change-over blocks put their circuits twelve columns apart and their cold legs four cells from the tees, so each of the five marked valves finds a spot; the renderer's spec now holds every chip of every plate clear of every run, panel and other chip, which is the test the first layout of this plate failed.
- **The plate is 3760 × 1761 px**, seven tenths again the bays'; the first view is the whole plate, small, and the operator zooms (AGR-1164's call on the first plate holds).
- **Every symbol type of the hydronic set but `pump_double` and `valve_check` is now placed.** The double pump stays registered and unplaced: each head is a device on the instance, and a symbol carries one `device_id`.
- **What authoring cost**, the number the next view is measured against (AGR-1164): about 3 h 10 of agent time in one afternoon, 2026-09-18. Preflight 55 min (sources, instance facts, drawing inventory, report); plate, registry, renderer fix, tests and docs 60 min; a code-review fix pass 25 min; a simplification pass and the chip leader 30 min; PR, CI fix, claim audit and amend 20 min. About half of the authoring went into fourteen render-and-diagnose rounds against the readout search's unwritten limits, which are now written (this list and the visual language's open points). For comparison, the Ouest bay cost 2 h 10 of preflight and 4 h 50 of plate, tests and docs on 2026-09-17; the Est bay's cost was not recorded.

## Appendix — symbol types of the hydronic kit

Input for the registry (AGR-1160) and the kit (AGR-1156, AGR-1159); the plates place all of them but `valve_check` and `pump_double`. Footprints are `w × d` at rotation 0; port offsets are relative to the origin cell.

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
| `pump_double` | 1 × 1 | yes | `in`, `out` | `state` | — |
| `energy_meter` | 1 × 1 | yes | `in`, `out` | `energy` | — |
| `loop_heater` | 1 × 1 | yes | `in`, `out` | `state`, `fault` | — |

No slot is required on any of these types in v1: a panel with fewer bound rows is a smaller panel, the same rule the shipped AHU synoptic applies to its coils.
