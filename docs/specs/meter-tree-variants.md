# Meter tree variants

A meter tree's `variant` (`default`, `electricity`, `water`) tells at a glance what the tree meters, following each domain's own diagram conventions.

## Conventions

| Domain | Source | Colour | Drawing |
|---|---|---|---|
| Electricity | Single-line diagrams (IEC 60617) | None | Right angles; heavier lines for main circuits |
| Electricity | Energy dashboards (common practice) | Yellow / gold, bolt icon | |
| Water | Pipe marking (ASME A13.1, NF X08-100) | Green | Pipe runs with bends |
| Water | Underground utility locate (APWA) | Blue | |

In the app, red means fault, green means ok and amber means warning, which rules out red for electricity and green for water.

## Decision

| Variant | Colour | Elbows | Icon |
|---|---|---|---|
| `electricity` | `--electricity` gold, darker than the warning tokens in both themes | Right angles | Bolt |
| `water` | `--fluid-cold-water`, the synoptics' cold-water blue | Pipe bend (`BEND_RADIUS`) | Droplet |
| `default` | Neutral grey | Right angles | None |

A variant the UI does not know is drawn as `default`, with a notice.

## Sources

- [ASME A13.1, ISO 14726, BS 1710 pipe colour codes](https://blog.projectmaterials.com/pipes/asme-a13-1-pipe-color-coding/)
- [NF X08-100](https://norminfo.afnor.org/norme/NF%20X08-100/couleurs-tuyauteries-rigides-identification-des-fluides-par-couleurs-conventionnelles/96471)
- [APWA uniform colour code](https://natcap.com/utility-color-codes/)
- [Single-line diagram](https://en.wikipedia.org/wiki/Single-line_diagram)
