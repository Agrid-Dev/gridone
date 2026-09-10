# Synoptic visual language and symbol kit

- **Status**: Draft
- **Milestone**: M1: Use cases, data and specs (Synoptique project)
- **Issues**: AGR-1156 (this spec), AGR-1157 (vendor the kit, consumes the tokens), AGR-1159 (draw the symbols, consumes the sheets), AGR-1158 (projection, owns `project()`)
- **Sheets**: [`synoptic/kit/isometric.svg`](synoptic/kit/isometric.svg), [`synoptic/kit/flat.svg`](synoptic/kit/flat.svg), [`synoptic/kit/density-collector-8.svg`](synoptic/kit/density-collector-8.svg), produced by [`synoptic/kit/generate.py`](synoptic/kit/generate.py) from the token values in `index.css`. They follow `prefers-color-scheme`, so open them in a browser rather than an image viewer.
- **Tokens**: `apps/ui/src/index.css` (`--synoptic-*`, `--fluid-*`) registered in `apps/ui/tailwind.config.js`.
- **Out of scope**: the document format (`synoptic-document.md`), the projection function and depth ordering (AGR-1158), the editor (AGR-1165). The issue predates the format and the registry; where they disagree, the backend wins and the sheets follow it.

The document format says what a plate *is*; this spec says how it *looks*. Everything the format leaves to the renderer (colours, strokes, fonts, chips, arrows, what stale and faulty look like) is decided here, once, so the ECS view and the CTA view read as one product.

## Decisions

1. **Tokens, not hex.** The gallery kit's `COLORS` map (`src/lib/theme.tsx` in `agrid-scada-components`) is hardcoded hex on a dark ground with metal gradients. Every colour here is a CSS variable in `index.css` with a light and a `.dark` value, next to `--status-*` and `--hvac-*`, so a plate themes like the rest of the app. The kit never reads a literal.
2. **Fluids are keyed on the document's `Fluid` vocabulary**, one token per member of `synoptics.models.Fluid`, eleven in v1. The POC's three-colour grammar (primary red, ECS amber, bouclage blue) is kept for primary and DHW and extended to the rest.
3. **A return keeps its supply's hue, desaturated and darker.** `primary_return` is the same red as `primary_supply` with the saturation cut and the lightness lowered, by eye rather than by formula; likewise heating, chilled, condenser, and `dhw` / `dhw_loop`. A pair reads as one loop at a glance, and eleven fluids need only six hues. This is why the bouclage is a dark amber rather than the POC's blue: blue is reserved for cold water, and chilled loops take cyan when the CTA views come.
4. **Fault and stale reuse existing tokens.** No `--synoptic-fault` or `--synoptic-stale` exists; see *Borrowed* under Tokens.
5. **Four surface tokens and no more**: `--synoptic-plate` (the ground), `--synoptic-grid` (footprints, editor grid), `--synoptic-body` (symbol fill) and `--synoptic-stroke` (symbol outline, glyph lines). Chips use `--card` / `--border`, text uses `--foreground` / `--muted-foreground`. Isometric side faces are the body fill under a black overlay at 12 % (`+x` face) and 22 % (`+y` face), so a new theme changes one token and every face follows.
6. **No gradients, no metal.** Flat fills with a 1.5 px outline. The gallery's `scada-metal` gradient is dropped with the dark-only palette it was drawn for.
7. **Fixed footprints from the registry.** A symbol is drawn to the `Footprint` its type declares in `synoptics.symbols.registry.build_default_registry` and nothing else; ports sit on the face the registry says they leave through. The sheets draw the footprint under each symbol and mark each port with its name so a drawing that drifts from the registry is visible.
8. **The pipe is the thickest line on the plate.** 5 px pipe over a 9 px `--synoptic-plate` casing, so a run crossing another at a higher `z` reads as in front without a drop shadow. Symbol outlines are 1.5 px, leaders 1 px. Flow is a moving dash in the plate colour on top of the pipe, off under `prefers-reduced-motion`.
9. **One arrow per pipe, at the `to` end**, 11 × 9 px in the fluid colour. The format says `to` is where the arrow goes (Pipes, `synoptic-document.md`); a tee draws a 4.5 px disc of the trunk's colour at the branch point and no junction symbol.
10. **A value is a chip, never bare text.** 22 px tall, 4 px radius, `--card` on `--border`, value in 12 px semibold with tabular numerals, unit in 10 px muted after it. The label (`TT-05`) is 9 px uppercase muted above the chip. This is the shipped `ValueChip` of `glyphs.tsx` with a squarer corner and a label, so the AHU synoptic adopts it without redrawing.
11. **A tag hangs from its cell by a leader**: a 1 px muted line from the chip to the run, ending in a 2.5 px disc in the fluid colour on the pipe. The chip sits 44 px above the cell by default; below when the author or the renderer alternates (Decision 15).
12. **Stale is a dashed chip in muted text.** The chip border goes to `--muted-foreground`, dashed 3/2, the value and unit go muted; the label does not change. In a panel row the value goes muted and gains a 2.5 px muted disc before it. Nothing turns orange: stale is "this number is old", not a warning.
13. **Fault is the error colour on the symbol, not on the value.** `Device.is_faulty` belongs to the symbol's `device_id` (Decision 7 of the format), so a faulty device outlines its symbol's silhouette in `--status-error` at 2.5 px and shows a 7 px error badge at the top-right of the footprint. Its panel takes the same 1.5 px error border, the LED goes red, and the `DÉFAUT` value goes red. A tag whose device is faulty takes the error border on the chip. Values are never recoloured on their own: a number is not a fault.
14. **The equipment panel is the POC's ÉTAT / DÉFAUT header kept.** 164 px wide; title left, LED right; `ÉTAT` and `DÉFAUT` on one row; a rule; then one row per bound slot with the slot label muted left and the value right. A slot with no binding is not a row (the format's appendix: "a panel with fewer bound rows is a smaller panel").
15. **Minimum text pitch is two cells.** The density sketch shows why: at one-cell pitch a chip is about 60 px wide and the projected step between neighbouring departures is 40 px, so tags on the same side overlap. The kit therefore requires two cells between text-bearing elements along one run, and alternates chips above and below across parallel runs at one-cell pitch. This is the number `synoptic-document.md` says the design pass owes. It is a lint the editor (AGR-1165) applies, not a save-time rule: a plate written through the API may break it and still be valid.
16. **Isometric and flat share everything but the projection.** Same tokens, strokes, chips, leaders, arrows and typography. A flat symbol is the P&ID plan glyph on the same footprint; an isometric symbol is the same object with height. A type that appears in both views (pump, valves, collector) ships both.
17. **Typography is the app's.** Figtree, with `tnum` on every value. Title 18 px semibold, caption 11 px semibold uppercase tracked, note 11 px regular, all mapping one-to-one to `Label.role`. Symbol labels are 11 px semibold, tag labels 9 px semibold uppercase. Nothing on the plate is smaller than 9 px.

## Tokens

Values live in `apps/ui/src/index.css` only, light and `.dark`, as `H S% L%` triplets like the rest of the file; a class is `text-fluid-dhw`, `stroke-synoptic-stroke`, a fill is `hsl(var(--fluid-dhw))`.

| Token | Used for |
|---|---|
| `--synoptic-plate` | plate ground, pipe casing, flow dash |
| `--synoptic-grid` | footprints, editor grid |
| `--synoptic-body` | symbol fill, duct fill |
| `--synoptic-stroke` | symbol outline, glyph lines, port marks |
| `--fluid-<member>` | one per `Fluid` member, `_` written `-`: `dhw_loop` is `--fluid-dhw-loop` |

`--fluid-cold-water` is its own token that currently resolves to `var(--water)`: `--water` means "liquid present at a probe", so the fluid keeps a name of its own and can take a value of its own without touching probe colours.

Borrowed, not redefined: `--card` / `--border` (chips, panels), `--foreground` / `--muted-foreground` (text, leaders, stale), `--status-error` (fault), `--status-ok` (panel LED), `--hvac-fan` (spinning fan).

On the TypeScript side (AGR-1157) the fluid map is a `Record<Fluid, string>` of literal classes next to `semanticColors.ts`, so Tailwind keeps them and no second naming appears.

## Geometry conventions the sheets draw to

Stated so the sheets can be checked against the registry.

- Isometric: 2:1 dimetric. `x` → right-and-down `(40, 20)` px, `y` → left-and-down `(−40, 20)` px, `z` → up `40` px per cell. A cell is an 80 × 40 px diamond.
- Flat: one cell = 48 px, `x` screen-right, `y` screen-down.
- The pipe axis runs through cell centres at `z = 0.4`, so a run passes mid-height of a one-cell symbol and a port is the centre of the footprint face.
- Ports are marked on the sheets as a 3.5 px `--card` disc on the face, named as the registry names them.

## Symbols

Footprints and ports are the registry's (`synoptics/symbols/registry.py`), restated in the format's appendix. The collector declares no footprint (its length is authored in props); inline types declare a 1 × 1 footprint with `inline=True`. Slots are listed so the panel rows are known.

| Type | Footprint | Isometric drawing | Flat drawing | Panel rows (slots) |
|---|---|---|---|---|
| `heat_pump` | 2 × 2 | box, fan grille on top, louvres on the `+y` face | square, fan grille | `state`, `fault`, `supply_temp`, `power` |
| `tank` | 1 × 2 | vertical cylinder two cells tall, dome ring on top | capsule, dome line | `temperature` |
| `collector` | none (`length` from props) | horizontal cylinder with flanged ends, ports authored | rounded bar | none |
| `mixing_valve` | 1 × 1 | three-way bowtie with stem, `M` above | three-way bowtie | `supply_temp` |
| `pump` | 1 × 1, inline | disc in the vertical plane, ISA triangle pointing downstream | circle, triangle | `state` |
| `valve_isolation` | 1 × 1, inline | bowtie with stem | bowtie with stem | `state` |
| `valve_check` | 1 × 1, inline | bowtie, ball downstream | bowtie, ball | none |
| `link` | 1 × 2 | pentagon standing in the `yz` plane, caption inside | pentagon, caption | none |

Not in the registry, asked for by the issue, drawn on the sheets. The footprints and ports below are input for the registry addition, which is where they become binding (as the format's appendix was for the first eight types); until then nothing checks a sheet against them:

| Proposed type | Footprint | Ports | Drawing |
|---|---|---|---|
| `plate_exchanger` | 1 × 1 | `primary_in −x`, `primary_out +x`, `secondary_in −y`, `secondary_out +y` | box with plate ridges, diagonal on top |
| `air_separator` | inline | none | short cylinder, automatic vent on top |
| `expansion_vessel` | 1 × 1 | `in −x` | capsule on a foot, diaphragm line |
| `dirt_separator` | inline | none | short cylinder, drain below |
| `pump_double` | inline | none | two pumps stacked (isometric) or side by side (flat) |
| `energy_meter` | inline | none | disc marked `kWh`, temperature tap |

The 2-way valve of the issue is `valve_isolation`; a motorised 2-way valve is the same glyph with an `M`, the registry decides whether that is a type or a slot.

## Distribution views

The shipped AHU and extractor glyphs (`apps/ui/src/pages/devices/standard-devices/synoptic/glyphs.tsx`) are kept as drawings and restyled: `--synoptic-body` / `--synoptic-stroke` instead of `fill-background` / `stroke-border`, the coil takes the fluid colour of what it carries (`--fluid-heating-supply`, `--fluid-chilled-supply`) instead of a caller-supplied class, the spinning fan keeps `--hvac-fan`, `ValueChip` and `MeasureTag` (label over value, leader line) become the chip and the tag. The pump synoptic shares the file and follows. The flat sheet shows the duct with damper, filter, fans, coils, chevrons and chips.

## Open points

- The `+y` face at 22 % is the darkest tone on the plate; if AGR-1158 lights the scene from the other side the two overlays swap, nothing else changes.
- Whether `energy_meter` and `pump_double` are inline or free-standing depends on how the first plate pipes them (AGR-1164).
- Font size below 11 px at typical laptop zoom is the first thing to revisit after the first real view.
