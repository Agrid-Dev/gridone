# Heat pump figure

`awhp-figure.svg` and `awhp-figure.json` are generated, not hand-written.
They come from the anatomy build of the ideal air-to-water heat pump
(`.user_projects/awhp-figure/build.mjs`, outside the repository, which needs
the isometric kit it imports):

```sh
node build.mjs --audit --ui apps/ui/src/pages/devices/standard-devices/awhp/figure
```

The SVG carries only geometry and class names; `awhp-figure.css` maps its
tones onto the app theme and `useAwhpFigure` drives it. The JSON holds what
the hook needs that the SVG does not say: the fan's screen basis, the flow
direction of each line per mode and the temperature profile along it.

Contract with the hook, by attribute in the SVG:

- `.it[data-piece]` — a drawn part; `data-piece` is a `FigurePiece`.
- `.aw-flow[data-flow-of]` — the dashed centreline of a pipe chunk.
- `linearGradient[data-flow] > stop[data-s]` — a temperature stop at
  position `s` along that flow.
- `.aw-label[data-piece]` with `.aw-l-name` / `.aw-l-value` tspans, and
  `.aw-arrow[data-piece]` — the callouts the hook fills and hides.
- `[data-part="blades"]` — the fan blades, turned with an SVG transform.
