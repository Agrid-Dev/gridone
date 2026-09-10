# Device Presentations

A driver may carry an optional `presentation` block describing how the device's detail page is composed: sections, controls, measurements, a demanded / regulated / measured table, and an exact graphic replica of the device's own screen. Gridone renders it with generic widgets; the driver contributes **data only** — no code, no HTML, no CSS, no URLs. A driver without a `presentation` keeps the standard page exactly as before.

Design record: `docs/specs/driver-defined-device-ui.md` (repository).

## Resolution and fallback

For the content of a device page, Gridone tries, in this order:

1. the driver's presentation, when it is declared, compatible with this Gridone version and valid against the driver's current attributes;
2. the standard page of the device `type` (thermostat, pump, …);
3. the generic attribute panes.

The fallback is always visible, with a diagnostic. A presentation is never rendered in part: an unknown capability, a missing binding or a broken asset makes the whole presentation unavailable while the transport, readings and commands keep working.

## Envelope

```yaml
presentation:
  schema_version: 1                # major version of this dialect
  requires:                        # capabilities the document uses
    - layout/1
    - controls/1
    - measurements/1
    - setpoint-table/1
    - device-face/1
    - glyph-text/1
    - conditions/1
  assets:                          # images shipped in the package (PNG or WebP)
    bezel: { path: assets/bezel.png }
    lcd: { path: assets/lcd-font.png }
  glyph_sets:                      # bitmap fonts cut from an atlas image
    lcd:
      asset: lcd
      line_height: 147
      base_line: 0
      cells:
        "2": { x: 90, y: 1, width: 58, height: 86, advance: 58, offset_x: -1, offset_y: 30 }
      kerning: { "4°": -1 }        # optional advance corrections per pair
  bindings:                        # local names for attributes of this device
    target: { attribute: temperature_setpoint }
    power: { attribute: onoff_state }
  controls:                        # what the user may write, bound to attributes
    target: { kind: number, binding: target, label: { default: Setpoint, translations: { fr: Consigne } } }
    power: { kind: toggle, binding: power, label: { default: Power } }
  page: …                          # the page tree, see below
```

- `schema_version` is the major version of the dialect. A server or browser that does not know it keeps the document untouched and falls back.
- `requires` lists capabilities. Every capability of this page is `name/1`; a Gridone that lacks one falls back with an `unsupported_capability` diagnostic.
- `assets` are files of the driver package, addressed by a relative path. Only PNG and WebP are accepted; images are re-encoded on import and served by Gridone under an authenticated route — the document can never point at an external URL.
- `bindings` give local names to attributes of the current device. Every other reference (`controls`, `measurements`, face layers, conditions) uses a binding id, never an attribute name.
- `controls` declare what may be written. `toggle` needs a boolean attribute, `number` an `int`/`float` one, `select` an attribute that has `value_options`. The step and bounds of a `number` control come from the attribute's `write_constraints` (see [General Layout](driver-schema/general-layout.md)), never from the presentation; while a referenced step or bound is unknown, increments are unavailable.

Texts are `LocalizedText` objects: `{ default: …, translations: { fr: …, en-GB: … } }`, resolved exact tag → base language → default.

## Page nodes (`layout/1`, `controls/1`, `measurements/1`, `setpoint-table/1`)

| Node | Fields | Renders |
|---|---|---|
| `stack` | `children` | Vertical stack |
| `columns` | `items: [{ weight, content }]` | Weighted columns, stacked on narrow screens |
| `section` | `title`, `description?`, `children` | A card with a heading |
| `attributes` | `group?` | The generic attribute panes (all attributes, or one declared group) |
| `control-panel` | `controls: [id]` | One row per control: switch, number stepper, or option picker, with the write state (sending, applied, failed, not confirmed) |
| `measurements` | `items: [{ binding, label?, formatter? }]` | Reported values, grouped by the attributes' `group` metadata |
| `setpoint-table` | `rows: [{ label, demanded, regulated?, measured?, deviation?, formatter? }]` | Demanded / regulated / measured / deviation rows |
| `device-face` | see below | The graphic replica |

A `formatter` is `{ decimals?, unit?, relative_time?, unavailable? }`: a fixed number of decimals, a unit symbol (defaults to the attribute's `unit`), the elapsed time since a timestamp value, and the text shown while the value is unknown (defaults to "Unavailable").

In a `setpoint-table` row, `demanded` is `{ control: id }` (an editable stepper) or `{ binding: id }`; `regulated` and `measured` are bindings; `deviation: { minuend, subtrahend, tolerance }` is the only arithmetic of the dialect — the difference of two numeric bindings, shown signed and classified against the tolerance.

## Device face (`device-face/1`, `glyph-text/1`)

```yaml
kind: device-face
label: { default: Thermostat }
view_box: { width: 562, height: 402 }        # the device's own pixel grid
layers:
  - kind: image
    asset: bezel
    box: { x: 0, y: 0, width: 562, height: 402 }
  - kind: rect                                 # a painted rectangle
    box: { x: 41, y: 41, width: 480, height: 320 }
    fill: "#3a3a3a"
    radius: 8
    visible_when: { op: eq, binding: power, value: true }
  - kind: glyph-text                           # a bitmap-font label
    id: icon_power
    glyph_set: lcd
    anchor: { box: { x: 41, y: 261, width: 120, height: 100 }, align: center }
    text: [{ literal: "" }]
    color: "#bebebe"
  - kind: glyph-text
    glyph_set: lcd
    anchor: { ref: icon_power, align: center, dx: 30, dy: -30 }
    text: [{ literal: "" }]
    color: "#ffffff"
    visible_when: { op: eq, binding: state_block, value: true }
  - kind: button                               # an interactive zone
    box: { x: 41, y: 261, width: 120, height: 100 }
    label: { default: Turn off, translations: { fr: Éteindre } }
    action: { control: power, op: toggle }
    blocked_when: { op: eq, binding: state_block, value: true }
```

The face is laid out in the device's own pixels and scaled as a whole to fit the page, never above 1:1. Layers are drawn in order.

| Layer | Fields |
|---|---|
| `image` | `asset`, `box` |
| `rect` | `box`, `fill` (`#rrggbb`), `radius?` |
| `glyph` | `glyph_set`, `char`, `box`, `color`, `label?` — one atlas cell stretched into a box |
| `glyph-text` | `glyph_set`, `anchor`, `text`, `color`, `size?`, `clip?`, `id?`, `label?` |
| `button` | `box`, `label`, `action: { control, op }`, `blocked_when?` |

Every layer accepts `visible_when`. A `color` is a constant or `{ rules: [{ when, color }], default }` — the first matching rule wins.

### Bitmap text

A `glyph-text` layer lays out its glyphs like an LVGL label: the label's width is the sum of the glyph advances (plus `kerning`), its height is `line_height`; it is placed on its `anchor` with the alignment arithmetic of `lv_obj_align` (`center`, `top-mid`, `bottom-right`, … and `out-right-mid` / `out-left-mid` for a label beside its anchor box), with C integer division; each glyph is blitted at `pen + offset_x`, `label.y + line_height − base_line − height − offset_y`. The anchor is a fixed `box`, or `ref: <id>` — the laid-out box of an earlier layer. `size` fixes the label's width or height instead of its content; `clip` cuts the glyphs to a box, as a container would on the device.

`text` is a list of parts, concatenated:

| Part | Meaning |
|---|---|
| `{ literal: "…" }` | Fixed characters (private-use code points address icon glyphs) |
| `{ digit: { binding, place: tens \| units \| tenths, chars? } }` | One decimal digit of the bound number's absolute value; `chars` maps 0–9 to other glyphs (combined dot + digit glyphs, for instance) |
| `{ number: { binding, decimals } }` | The bound number with a fixed number of decimals |
| `{ select: { binding, cases: { value: text }, default? } }` | The bound value mapped to text |

A layer whose text depends on an unknown value draws nothing.

### Actions

`op` must match the control's kind: `toggle` for a toggle, `increment` / `decrement` for a number (one step of the attribute's `write_constraints`), `cycle` for a select (the next `value_options` entry). A blocked button (`blocked_when` true or unknown) stays focusable and announced, but inert. Writes go through the same runtime as the form controls: a discrete action is sent at once, a burst of increments is sent once after 600 ms, at most one write is in flight per attribute, and a reported value never overrides a newer intention.

## Conditions (`conditions/1`)

```yaml
visible_when:
  op: all
  conditions:
    - { op: eq, binding: power, value: true }
    - { op: not, condition: { op: in, binding: mode, values: [fan] } }
```

Operators: `eq`, `in`, `is_known`, `not`, `all`, `any`, nested at most 8 deep, at most 1 000 evaluations per render. Evaluation is three-valued: a comparison on an unknown value is unknown, and unknown propagates. An unknown visibility hides; an unknown blocking condition blocks. There are no expressions, functions or path lookups.

## Validation

The manifest is validated on import: unknown keys, wrong types, references to undeclared bindings, controls, assets, glyph sets or layer ids, a `ref` to a later layer, an action whose `op` does not match its control's kind, a `toggle` on a non-boolean attribute, and the budgets below are all refused with a path (`/page/items/1/content/layers/3/anchor/ref`) and a code. A document that becomes invalid after a driver edit (an attribute deleted) is kept, and the page falls back with a diagnostic until the driver is fixed. Renaming an attribute updates the bindings that point at it.

| Budget | Limit |
|---|---|
| Manifest | 1 MiB, nesting ≤ 64, ≤ 2,000 aliases and ≤ 50,000 expanded nodes |
| Package | ZIP ≤ 20 MiB compressed / 50 MiB decompressed, ≤ 128 entries, images ≤ 10 MiB and ≤ 16 megapixels each, ≤ 64 images and ≤ 64 megapixels in total |
| Document | ≤ 300 bindings, ≤ 300 controls, ≤ 600 nodes and layers, layout depth ≤ 8, condition depth ≤ 8 |

## Accessibility

Interactive zones are real buttons with an accessible name; digits and readings carry a text alternative; the write state is announced politely; the same commands stay available through the form controls when the face is scaled too small for comfortable targets. Pages reflow to a single column at 320 CSS pixels.

## Packaging and import

A package is a ZIP containing `driver.yaml` at its root and exactly the local
images declared by `presentation.assets`. A YAML file alone is accepted when it
does not require image files. PNG and static WebP inputs are decoded and normalized
to PNG; the server never fetches remote resources.

Validate and build packages locally with the same validator used by the server:

```sh
gridone drivers validate ./driver.yaml
gridone drivers validate ./thermostat.zip
gridone drivers pack ./thermostat -o ./thermostat.zip
```

`validate` reports stable diagnostic codes, field paths and YAML line/column when
available, and exits with status 1 on invalid input. `pack` applies the same size
budgets before writing the output and never overwrites a source file; an existing
output ZIP inside the source directory is excluded when rebuilding the package. Unknown presentation versions
or capabilities are preserved and reported as unavailable; a valid driver can
still operate with the standard presentation.

Install with `PUT /drivers/{id}/package`, using `Content-Type: application/zip` or
`application/yaml`. The manifest ID must match the URL. To replace a presentation
conditionally, obtain its `revision` from `GET /drivers/{id}/presentation` and pass
`?expected_revision=<revision>`. A stale revision returns 409; fetch the current
presentation before reviewing and retrying. A refused import returns 422 with
`detail: [{code, path, line, column, message}]` and preserves the active driver.
The driver response's read-only `presentation_revision` is the resource storage
pointer; use the presentation response's `revision` as the concurrency token.
Drivers without a presentation return `null` from the presentation endpoint;
omit `expected_revision` in that case.

`GET /drivers/{id}/package` exports a restorable ZIP containing the full driver
and normalized images. Imports require `drivers:write`; exports and presentation
inspection require `drivers:read`. The TypeScript SDK exposes
`drivers.installPackage(id, blob, {expectedRevision})`,
`drivers.exportPackage(id)` (a Blob), and `drivers.getPresentation(id)`.

Upload limits apply to bytes actually received: ZIP 20 MiB compressed, 50 MiB
uncompressed, 128 entries, YAML 1 MiB, images 10 MiB each, 16 million pixels per
image and 64 million pixels/64 images per package. YAML depth is bounded at 64,
expanded nodes at 50,000 and aliases at 2,000. Absolute paths, traversal, symbolic
links, duplicate/colliding names, encrypted or nested archives, animation and
unsupported file types are refused.

Resources are written as an immutable revision before the driver pointer is
activated. Failed preparation or persistence leaves the previous driver active;
concurrent replacement is checked against the durable driver snapshot. The
current and previous resource revisions are retained, and older revisions are
pruned after successful activation. Resource URLs require normal authentication;
no authentication token belongs in a URL.
