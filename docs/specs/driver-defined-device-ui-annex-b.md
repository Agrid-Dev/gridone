# Annex B — Phase 0 results: frozen v1 vocabulary, fidelity, security

Status: phase 0 closed on 2026-09-09. Companion of the ADR
[driver-defined-device-ui.md](driver-defined-device-ui.md) (§14 phase 0) and of
[annex A](driver-defined-device-ui-annex-a.md) (firmware inventory).
É2–É5 implementation is now delivered; the [local validation report](driver-defined-device-ui-validation.md)
records final tests, mutations, crash tests, rendering measurements and partial
accessibility/CSP observations. Phase 0 results below remain historical evidence;
the ADR is still proposed while the hardware gate is pending.

## 1. What was proven

| Spike | Result | Evidence |
| --- | --- | --- |
| Exact replica without vendor code | The Agrid thermostat face is expressed with generic layers only (`image`, `rect`, `glyph-text`, `button`); Gridone holds no brand, model or driver id. | `apps/ui/src/components/device-ui/fixtures/agridThermostat/face.ts`, engine in `apps/ui/src/components/device-ui/face/` |
| Fidelity, geometry | For 10 firmware screen states the engine lays every glyph and rectangle on the same pixel as the firmware (position, size, colour), with **no tolerance**. | `apps/ui/src/components/device-ui/face/__tests__/agridThermostatFidelity.spec.ts` against the LVGL reference lists in `__tests__/fixtures/lvgl/` (a 1-px shift of one digit fails 7 of the 10 states) |
| Fidelity, pixels | Headless Chrome captures of the same 10 states differ from the firmware renders by **at most 1/255 per channel on every pixel** (corners of the physical panel masked). ADR §15 criterion 7 asked for ±1 px and < 0.5 % divergent pixels. | Capture/diff script kept with the spike artefacts (`~/code/Agrid/tmp/agr-1198-spikes/fidelity/`) |
| Assets by construction | Glyphs are decoded from the firmware's LVGL fonts (`main_font`, `hand_font`, `montserrat_16` subset) by an exact port of `lv_font_fmt_txt.c` (RLE + XOR prefilter, 4 bpp, class kerning, `adv_w` rounding). Every glyph decodes to its `box_w × box_h` and consumes exactly its byte range. | `~/code/Agrid/tmp/agr-1198-spikes/lvgl-export/fonts.py`, atlases in the fixture directory |
| Layout by construction | Object rectangles come from a model of `lv_obj_refr_pos` / `lv_obj_align_to` / `lv_text_get_size` / `draw_letter` with C integer division (`pw / 2 - w / 2`, not `(pw - w) / 2`). | `~/code/Agrid/tmp/agr-1198-spikes/lvgl-export/scene.py`, `layout.json` |
| Import security | 75 hostile archives (zip-slip, Unicode/case collisions, symlinks, encrypted, nested, bombs, lying sizes, disguised images, decompression bombs) refused before any expansion; legitimate archives accepted; crash-safe revision activation survives 10 injected crash points and 30 random `kill -9`. | `~/code/Agrid/tmp/agr-1198-spikes/0e-security/REPORT.md` and prototypes |

## 2. Frozen v1 vocabulary (capabilities announced in `requires`)

Everything is data. Unknown capability → the whole presentation is unavailable with a diagnostic.

| Capability | Content |
| --- | --- |
| `layout/1` | Page nodes `stack`, `columns` (weighted items), `section` (localized title, optional description), `attributes` (the generic attribute panes, optional `group` filter). |
| `controls/1` | `control-panel` listing declared controls: `toggle` (bool), `number` (step and bounds from the attribute's `write_constraints`, never from the document), `select` (options from `value_options`). Per-attribute write state comes from the Gridone runtime. |
| `measurements/1` | `measurements` listing bindings with a declarative formatter: `decimals`, `unit` (literal or the attribute's `unit`), `relative_time` (elapsed since a timestamp value), `unavailable` text. Bindings sharing a `group` render as sub-sections. |
| `setpoint-table/1` | Rows `{label, demanded: control or binding, regulated?: binding, measured?: binding, deviation?: {minuend, subtrahend, tolerance}}`. The deviation is the only arithmetic of the dialect: a difference of two numeric bindings classified against a declared tolerance. |
| `device-face/1` | A fixed `view_box`; layers `image`, `rect` (fill, radius), `glyph` (one atlas cell stretched into a box), `glyph-text` (below), `button` (label, action, `blocked_when`); every layer accepts `visible_when`; colours are `#RRGGBB` constants or `{rules: [{when, color}], default}`; a layer may carry an `id` other layers anchor on. |
| `glyph-text/1` | A run of glyphs from a declared `glyph_set` laid out like an LVGL label: `anchor` = `{box | ref, align, dx, dy}` with the nine inner alignments plus `out-right-mid` / `out-left-mid`; optional fixed `size`; optional `clip` box; `text` parts `literal`, `digit` (`tens`/`units`/`tenths` of a bound number, optional `chars` map), `number` (fixed `decimals`), `select` (value → text, optional default). An unknown bound value renders nothing. |
| `conditions/1` | `eq`, `in`, `is_known`, `not`, `all`, `any` in three-valued logic; unknown never activates (visibility) and always blocks (blocking). Depth ≤ 8, ≤ 1000 evaluations per render. |

Glyph sets (`glyph_sets` at the envelope root) are `{asset, line_height, base_line, cells: {char: {x, y, width, height, advance, offset_x, offset_y}}, kerning?: {pair: delta}}` — per-glyph cells with bitmap-font metrics, not a uniform grid. Assets are PNG or WebP only.

The ADR §8 example is superseded by this vocabulary where they differ (`glyph-number` became `glyph-text` with `digit` parts; colours are typed; anchors carry LVGL alignment).

## 3. Decisions taken at the gate

1. **Mode on the face binds to the resolved real mode** (`HVAC_Real_Mode`, an enum name); the `mode` control keeps the standard attribute, whose decoding still assumes the default mode list. The delivered pilot exposes `hvac_mode_0..9` and `hvac_real_mode`; arbitrary configured mode lists remain a limitation to verify in É6 (annex A §3.3), not a solved mapping.
2. **Setpoint bounds**: no firmware variable exposes the effective range (annex A §A6); the pilot declares `write_constraints.step: {attribute: tsetpoint_precision}` only and relies on the device's clamp + echo for bounds; per-mode configured bounds are shown as information. No mode-keyed bound construct in v1.
3. **Top line visibility** binds to `Print_Indoor_Temperature` / `Print_Humidity` (both default false on a factory device). The device also hides an out-of-validity reading (5–50 °C, 0–100 %); v1 has no range operator and shows the reading — documented deviation.
4. **Locks**: `button.blocked_when` bound to `*_Block`, plus a lock glyph shown while the block is active. The device only flashes it for 3 s on a blocked touch — documented deviation.
5. **Unavailable in v1** (no variable, annex A §3.1): setback active/since, eco-because-unoccupied, last movement, keycard/external presence/window (never fed by this firmware), last command origin. Shown as unavailable text, never invented. `Tsetpoint_Effective` exists, so the "regulated" column is real.
6. **Number formatting**: `number.decimals` is a document constant; the device rounds to a configurable precision — a reading of 21.4 °C with `Temperature_Precision 0.5` shows `21.5°C` on the device and `21.4°C` on the face. Documented deviation, revisit if hardware validation shows it matters.
7. **`hand_font`** decodes to inverted masks with the exact decoder (annex of the export notes); the pilot ships the main font only until hardware confirms the look.
8. **Fahrenheit**: the device converts for display; MQTT `Tsetpoint` stays °C. The face shows the bound value as-is; a °F device is out of the pilot's scope.

## 4. Budgets (server-defined, exposed to tools)

| Budget | Value |
| --- | --- |
| Manifest YAML | 1 MiB, depth 64, 50 000 expanded nodes, at most 2 000 aliases within those expansion/depth limits, keys `str` or `int` (ints canonicalised to decimal strings, duplicates checked after canonicalisation) |
| ZIP | 20 MiB compressed, 50 MiB decompressed, 128 entries, `driver.yaml` ≤ 1 MiB, image ≤ 10 MiB per entry, ASCII paths ≤ 128 chars and ≤ 4 segments, no directory data, no symlink, no encryption, deflate/stored only |
| Images | PNG/WebP static only, 16 MP each, ≤ 64 images and ≤ 64 MP total per package, re-encoded to PNG with metadata stripped, normalised sequentially |
| Document | 300 bindings, 300 controls, 600 nodes/layers, layout depth 8, condition depth 8, 1000 evaluations per render |
| Upload | 20 MiB stream cap on the route |

Findings that shape É2: PyYAML expands aliases at dump time, not load time (the blow-up lands in the API response and the JSONB write, so the composer must count expanded nodes); a `CSafeLoader` subclass overriding `compose_node` is silently bypassed unless the mixin precedes `CParser`; the KNX fixture uses integer mapping keys; `YamlFileStorage._write_sync` truncated in place in the initial snapshot. É2-B now uses temp files, synchronisation and atomic replacement; the final implementation has four real process-crash tests. Pillow is now a direct `devices_manager` dependency. The delivered hostile archive corpus contains 91 cases; the 75 archives and random kills in §1 describe the earlier spike.

## 5. Deviations from the plan

- 0d (second, structurally different fixture) is done with the frozen vocabulary in É1, not before it: the vocabulary above was fixed by the thermostat and the target page, a second device only confirms reuse.
- The hand-font and portrait variants are exported but not part of the fidelity gate; they are validated with hardware in É6.

The second pump fixture is delivered on the same primitives, without a vendor branch. Final YAML/TypeScript parity is checked in CI; mutating a declared panel control produces a real failure. The final local rendering measurement (p95 17.7 ms for 300 attributes/150 visible measurements) and manual plus axe-core 4.13.0 mobile/keyboard/contrast checks are detailed in the validation report, with no claim of hardware latency or complete accessibility/CSP certification.
