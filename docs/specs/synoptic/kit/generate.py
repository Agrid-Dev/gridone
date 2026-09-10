"""Generate the synoptic kit sheets next to this file.

Run from the repo root: ``uv run python docs/specs/synoptic/kit/generate.py``.

Token values are read from ``apps/ui/src/index.css`` so the sheets preview the
app's own palette; the geometry follows ``docs/specs/synoptic-visual-language.md``.
"""

import math
import re
from collections.abc import Callable, Iterable, Sequence
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
INDEX_CSS = ROOT / "apps/ui/src/index.css"

# 2:1 dimetric projection, one cell = 80 x 40 px diamond, 40 px per z unit.
SX, SY, SZ = 40, 20, 40
# Flat projection, one cell = 48 px.
FC = 48
# Pipe axis height inside a cell.
AXIS = 0.4

TOKENS = [
    "synoptic-plate",
    "synoptic-grid",
    "synoptic-body",
    "synoptic-stroke",
    "foreground",
    "muted-foreground",
    "card",
    "border",
    "status-error",
    "status-ok",
    "hvac-fan",
    "fluid-primary-supply",
    "fluid-primary-return",
    "fluid-heating-supply",
    "fluid-heating-return",
    "fluid-dhw",
    "fluid-dhw-loop",
    "fluid-cold-water",
    "fluid-chilled-supply",
    "fluid-chilled-return",
    "fluid-condenser-supply",
    "fluid-condenser-return",
]
FLUIDS = [t for t in TOKENS if t.startswith("fluid-")]

Pt = tuple[float, float]
Pt3 = tuple[float, float, float]


def read_tokens() -> tuple[dict[str, str], dict[str, str]]:
    """Light and dark ``H S% L%`` triplets of ``TOKENS`` from ``index.css``."""
    light_block, dark_block = INDEX_CSS.read_text().split(".dark {", 1)

    def pick(block: str) -> dict[str, str]:
        return {
            t: re.search(rf"--{t}: ([^;]+);", block).group(1)  # type: ignore[union-attr]
            for t in TOKENS
        }

    return pick(light_block), pick(dark_block)


# Rules are grouped so shared declarations are written once; only the classes a
# sheet uses are emitted.
RULES: list[tuple[tuple[str, ...], str]] = [
    (("plate",), "fill:hsl(var(--synoptic-plate))"),
    (("grid",), "stroke:hsl(var(--synoptic-grid));stroke-width:1;fill:none"),
    (
        ("body", "shade", "shade2"),
        "stroke:hsl(var(--synoptic-stroke));stroke-width:1.5;stroke-linejoin:round",
    ),
    (("body",), "fill:hsl(var(--synoptic-body))"),
    (("shade",), "fill:#000;fill-opacity:.12"),
    (("shade2",), "fill:#000;fill-opacity:.22"),
    (
        ("line",),
        "stroke:hsl(var(--synoptic-stroke));stroke-width:1.5;fill:none;"
        "stroke-linecap:round;stroke-linejoin:round",
    ),
    (("fill",), "fill:hsl(var(--synoptic-stroke))"),
    (
        ("port",),
        "fill:hsl(var(--card));stroke:hsl(var(--synoptic-stroke));stroke-width:1.5",
    ),
    (
        ("casing",),
        "stroke:hsl(var(--synoptic-plate));stroke-width:9;fill:none;"
        "stroke-linejoin:round;stroke-linecap:round",
    ),
    (("pipe",), "stroke-width:5;fill:none;stroke-linejoin:round;stroke-linecap:round"),
    (
        ("flow",),
        "stroke:hsl(var(--synoptic-plate));stroke-width:1.6;fill:none;"
        "stroke-dasharray:4 12;stroke-linecap:round;animation:flow 1s linear infinite",
    ),
    (("leader",), "stroke:hsl(var(--muted-foreground));stroke-width:1;fill:none"),
    (("chip", "chip-stale", "chip-fault"), "fill:hsl(var(--card))"),
    (("chip",), "stroke:hsl(var(--border));stroke-width:1"),
    (
        ("chip-stale",),
        "stroke:hsl(var(--muted-foreground));stroke-width:1;stroke-dasharray:3 2",
    ),
    (("chip-fault",), "stroke:hsl(var(--status-error));stroke-width:1.5"),
    (("t",), "fill:hsl(var(--foreground))"),
    (("tm",), "fill:hsl(var(--muted-foreground))"),
    (("te",), "fill:hsl(var(--status-error))"),
    (("title",), "font-size:18px;font-weight:600;letter-spacing:-.01em"),
    (
        ("caption",),
        "font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase",
    ),
    (("note",), "font-size:11px;font-weight:400"),
    (("tag",), "font-size:9px;font-weight:600;letter-spacing:.06em"),
    (("val",), "font-size:12px;font-weight:600"),
    (("unit",), "font-size:10px;font-weight:500"),
    (("sym",), "font-size:11px;font-weight:600"),
    (("h",), "font-size:12px;font-weight:600"),
    (
        ("fault",),
        "stroke:hsl(var(--status-error));stroke-width:2.5;fill:none;"
        "stroke-linejoin:round",
    ),
]


def style(body: str) -> str:
    light, dark = read_tokens()
    used = set(re.findall(r'class="([^"]+)"', body))
    used = {c for classes in used for c in classes.split()}

    def block(values: dict[str, str]) -> str:
        return "".join(f"--{k}:{v};" for k, v in values.items())

    rules = []
    for classes, decl in RULES:
        kept = [c for c in classes if c in used]
        if kept:
            rules.append(",".join(f".{c}" for c in kept) + "{" + decl + "}")
    css = "\n".join(rules)
    return (
        "<style>\n"
        f"svg{{{block(light)}font-family:Figtree,system-ui,sans-serif;"
        'font-feature-settings:"tnum"}\n'
        f"@media (prefers-color-scheme: dark){{svg{{{block(dark)}}}}}\n"
        f"{css}\n"
        "@keyframes flow{to{stroke-dashoffset:-16}}\n"
        "@media (prefers-reduced-motion: reduce){.flow{animation:none}}\n"
        "</style>"
    )


def sheet(width: int, height: int, body: str) -> str:
    body = f'<rect class="plate" width="{width}" height="{height}"/>\n{body}'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">\n{style(body)}\n{body}\n</svg>\n'
    )


# ── isometric helpers ────────────────────────────────────────────────────────


def project(x: float, y: float, z: float = 0.0) -> Pt:
    return ((x - y) * SX, (x + y) * SY - z * SZ)


def pts(points: Iterable[Pt]) -> str:
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in points)


def poly(points: Iterable[Pt3], cls: str) -> str:
    return f'<polygon class="{cls}" points="{pts(project(*p) for p in points)}"/>'


def path3d(points: Iterable[Pt3], cls: str, *, close: bool = False) -> str:
    d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in (project(*p) for p in points))
    if close:
        d += " Z"
    return f'<path class="{cls}" d="{d}"/>'


def circle3d(c: Pt3, r: float, plane: str, n: int = 36) -> list[Pt3]:
    """Points of a circle of radius ``r`` around ``c`` in plane xy, xz or yz."""
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        a, b = r * math.cos(t), r * math.sin(t)
        if plane == "xy":
            out.append((c[0] + a, c[1] + b, c[2]))
        elif plane == "xz":
            out.append((c[0] + a, c[1], c[2] + b))
        else:
            out.append((c[0], c[1] + a, c[2] + b))
    return out


def circle_path(c: Pt3, r: float, plane: str, cls: str) -> str:
    return path3d(circle3d(c, r, plane), cls, close=True)


def shaded(face: Sequence[Pt3], cls: str) -> str:
    """A face in the body fill under its shade overlay."""
    return poly(face, "body") + poly(face, cls)


def box(x: float, y: float, z: float, w: float, d: float, h: float) -> str:
    """Three visible faces of a box: top, +x face, +y face."""
    top = [(x, y, z + h), (x + w, y, z + h), (x + w, y + d, z + h), (x, y + d, z + h)]
    fx = [(x + w, y, z), (x + w, y + d, z), (x + w, y + d, z + h), (x + w, y, z + h)]
    fy = [(x, y + d, z), (x + w, y + d, z), (x + w, y + d, z + h), (x, y + d, z + h)]
    return shaded(fy, "shade2") + shaded(fx, "shade") + poly(top, "body")


def cylinder_v(cx: float, cy: float, z: float, r: float, h: float) -> str:
    """Vertical cylinder: the side sweep facing the viewer, then the top ellipse."""
    top = circle3d((cx, cy, z + h), r, "xy")
    bot = circle3d((cx, cy, z), r, "xy")
    proj = [project(*p) for p in top]
    li = min(range(len(proj)), key=lambda i: proj[i][0])
    ri = max(range(len(proj)), key=lambda i: proj[i][0])

    def walk(step: int) -> list[int]:
        idx, i = [], li
        while True:
            idx.append(i)
            if i == ri:
                return idx
            i = (i + step) % len(top)

    idx = walk(1)
    if sum(proj[i][1] for i in idx) / len(idx) < project(cx, cy, z + h)[1]:
        idx = walk(-1)
    side = [bot[i] for i in idx] + [top[i] for i in reversed(idx)]
    return (
        path3d(side, "body", close=True)
        + path3d(side, "shade", close=True)
        + circle_path((cx, cy, z + h), r, "xy", "body")
    )


def cylinder_h(x0: float, x1: float, y: float, z: float, r: float) -> str:
    """Horizontal cylinder along x between ``x0`` and ``x1``."""
    a = circle3d((x0, y, z), r, "yz")
    b = circle3d((x1, y, z), r, "yz")
    pa = [project(*p) for p in a]
    ax = project(*b[0])[0] - pa[0][0], project(*b[0])[1] - pa[0][1]
    n = (-ax[1], ax[0])
    i0 = min(range(len(pa)), key=lambda i: pa[i][0] * n[0] + pa[i][1] * n[1])
    i1 = max(range(len(pa)), key=lambda i: pa[i][0] * n[0] + pa[i][1] * n[1])
    side = [a[i0], b[i0], b[i1], a[i1]]
    front = b if project(*b[0])[1] > pa[0][1] else a
    return (
        path3d(side, "body", close=True)
        + path3d(side, "shade", close=True)
        + path3d(front, "body", close=True)
    )


def arrow_head(a: Pt, b: Pt, fluid: str, ln: float = 11, w: float = 9) -> str:
    dx, dy = b[0] - a[0], b[1] - a[1]
    m = math.hypot(dx, dy) or 1
    ux, uy = dx / m, dy / m
    bx, by = b[0] - ux * ln, b[1] - uy * ln
    p = [b, (bx - uy * w / 2, by + ux * w / 2), (bx + uy * w / 2, by - ux * w / 2)]
    return f'<polygon style="fill:hsl(var(--{fluid}))" points="{pts(p)}"/>'


def pipe(
    points: Sequence[Pt], fluid: str, *, arrow: bool = True, flow: bool = False
) -> str:
    d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in points)
    out = (
        f'<path class="casing" d="{d}"/>'
        f'<path class="pipe" style="stroke:hsl(var(--{fluid}))" d="{d}"/>'
    )
    if flow:
        out += f'<path class="flow" d="{d}"/>'
    if arrow:
        out += arrow_head(points[-2], points[-1], fluid)
    return out


def pipe_iso(
    cells: Sequence[Pt3], fluid: str, *, arrow: bool = True, flow: bool = False
) -> str:
    return pipe([project(*c) for c in cells], fluid, arrow=arrow, flow=flow)


SIDE_OFFSET = {"+x": (0.5, 0.0), "-x": (-0.5, 0.0), "+y": (0.0, 0.5), "-y": (0.0, -0.5)}


def text(x: float, y: float, s: str, cls: str = "t", anchor: str = "start") -> str:
    return (
        f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}">{s}</text>'
    )


def port_mark(x: int, y: int, side: str, name: str) -> str:
    """Port marker: a disc on the face the pipe leaves through, named."""
    cx, cy = x + 0.5, y + 0.5
    ox, oy = SIDE_OFFSET[side]
    px, py = project(cx + ox, cy + oy, AXIS)
    lx, _ = project(cx + ox * 1.9, cy + oy * 1.9, AXIS)
    anchor = "start" if lx > px else "end"
    return f'<circle class="port" cx="{px:.1f}" cy="{py:.1f}" r="3.5"/>' + text(
        lx, py + 3, name, "tag tm", anchor
    )


def footprint(x: int, y: int, w: int, d: int) -> str:
    return "".join(
        poly(
            [
                (x + i, y + j, 0),
                (x + i + 1, y + j, 0),
                (x + i + 1, y + j + 1, 0),
                (x + i, y + j + 1, 0),
            ],
            "grid",
        )
        for i in range(w)
        for j in range(d)
    )


def chip(
    cx: float, cy: float, label: str, value: str, unit: str = "", state: str = "ok"
) -> str:
    """Value chip, 22 px tall: value and unit inside, label above."""
    w = max(44, 7.2 * len(value) + 6.5 * len(unit) + 18)
    cls = {"ok": "chip", "stale": "chip-stale", "fault": "chip-fault"}[state]
    tcls = "tm" if state == "stale" else "t"
    out = f'<rect class="{cls}" x="{cx - w / 2:.1f}" y="{cy - 11:.1f}" width="{w:.1f}" height="22" rx="4"/>'
    vx = cx - (6.5 * len(unit) + 3) / 2 if unit else cx
    out += text(vx, cy + 4, value, f"val {tcls}", "middle")
    if unit:
        out += text(vx + 7.2 * len(value) / 2 + 3, cy + 4, unit, f"unit {tcls}")
    if label:
        out += text(cx, cy - 15, label, "tag tm", "middle")
    return out


def tag_iso(
    cell: Pt3,
    fluid: str,
    label: str,
    value: str,
    unit: str = "",
    state: str = "ok",
    side: str = "above",
) -> str:
    """A tag riding on a run: leader from the chip to the pipe, dot on the pipe."""
    px, py = project(cell[0] + 0.5, cell[1] + 0.5, cell[2] + AXIS)
    above = side == "above"
    cy = py - 44 if above else py + 44
    end = cy + 11 if above else cy - 15
    out = f'<line class="leader" x1="{px:.1f}" y1="{py:.1f}" x2="{px:.1f}" y2="{end:.1f}"/>'
    out += f'<circle style="fill:hsl(var(--{fluid}))" cx="{px:.1f}" cy="{py:.1f}" r="2.5"/>'
    if above:
        return out + chip(px, cy, label, value, unit, state)
    return (
        out
        + chip(px, cy + 8, "", value, unit, state)
        + text(px, cy + 30, label, "tag tm", "middle")
    )


# ── isometric symbols, drawn at origin cell (0, 0), rotation 0 ───────────────


def sym_heat_pump() -> str:
    out = box(0, 0, 0, 2, 2, 1.3)
    out += circle_path((1, 1, 1.3), 0.62, "xy", "line")
    out += circle_path((1, 1, 1.3), 0.08, "xy", "fill")
    for k in range(3):
        t = 2 * math.pi * k / 3
        out += path3d(
            [(1, 1, 1.3), (1 + 0.55 * math.cos(t), 1 + 0.55 * math.sin(t), 1.3)], "line"
        )
    for i in range(1, 4):
        out += path3d([(0.25, 2, 0.3 * i), (1.75, 2, 0.3 * i)], "line")
    return out


def sym_tank(z_top: float = 2.2) -> str:
    return cylinder_v(0.5, 1.0, 0, 0.5, z_top) + circle_path(
        (0.5, 1.0, z_top), 0.32, "xy", "line"
    )


def sym_collector(length: int = 4) -> str:
    out = cylinder_h(0, length, 0.5, AXIS, 0.22)
    for x in (0.05, length - 0.05):
        out += circle_path((x, 0.5, AXIS), 0.28, "yz", "line")
    return out


def valve_body(
    cx: float, cy: float, cz: float, axis: str = "x", *, tee: bool = False
) -> str:
    """ISA bowtie in the vertical plane along the pipe axis, with its stem."""
    r = 0.28
    if axis == "x":
        a = [
            (cx - r, cy, cz - r),
            (cx - r, cy, cz + r),
            (cx + r, cy, cz - r),
            (cx + r, cy, cz + r),
        ]
    else:
        a = [
            (cx, cy - r, cz - r),
            (cx, cy - r, cz + r),
            (cx, cy + r, cz - r),
            (cx, cy + r, cz + r),
        ]
    out = poly(a, "body")
    if tee:
        b = (
            [(cx, cy + r, cz - r), (cx, cy + r, cz + r)]
            if axis == "x"
            else [(cx + r, cy, cz - r), (cx + r, cy, cz + r)]
        )
        out += poly([(cx, cy, cz), b[0], b[1]], "body")
    out += path3d([(cx, cy, cz), (cx, cy, cz + 0.45)], "line")
    out += path3d([(cx - 0.15, cy, cz + 0.45), (cx + 0.15, cy, cz + 0.45)], "line")
    return out


def sym_valve_isolation() -> str:
    return valve_body(0.5, 0.5, AXIS)


def sym_valve_check() -> str:
    return valve_body(0.5, 0.5, AXIS) + circle_path(
        (0.62, 0.5, AXIS), 0.09, "xz", "fill"
    )


def sym_mixing_valve() -> str:
    return valve_body(0.5, 0.5, AXIS, tee=True) + text(
        *project(0.5, 0.5, 1.1), "M", "sym t", "middle"
    )


def pump_body(cx: float, cy: float, cz: float, r: float = 0.3) -> str:
    out = circle_path((cx, cy, cz), r, "xz", "body")
    return out + poly(
        [
            (cx - r * 0.55, cy, cz + r * 0.6),
            (cx - r * 0.55, cy, cz - r * 0.6),
            (cx + r * 0.75, cy, cz),
        ],
        "fill",
    )


def sym_pump() -> str:
    return pump_body(0.5, 0.5, AXIS)


def sym_pump_double() -> str:
    return pump_body(0.5, 0.5, AXIS) + pump_body(0.5, 0.5, 1.05, r=0.28)


def sym_link() -> str:
    out = poly([(0, 0, 0), (0, 2, 0), (0, 2, 0.8), (0, 1, 1.15), (0, 0, 0.8)], "body")
    return out + text(*project(0.02, 1.0, 0.12), "ECS OUEST", "tag t", "middle")


def sym_exchanger() -> str:
    out = box(0, 0, 0, 1, 1, 1.4)
    for i in range(1, 6):
        out += path3d([(i / 6, 1, 0.1), (i / 6, 1, 1.3)], "line")
    return out + path3d([(0, 0, 1.4), (1, 1, 1.4)], "line")


def sym_air_separator() -> str:
    out = cylinder_v(0.5, 0.5, 0.05, 0.3, 0.75)
    out += path3d([(0.5, 0.5, 0.8), (0.5, 0.5, 1.1)], "line")
    return out + circle_path((0.5, 0.5, 1.15), 0.1, "xy", "body")


def sym_expansion_vessel() -> str:
    out = cylinder_v(0.5, 0.5, 0.15, 0.32, 0.9)
    out += circle_path((0.5, 0.5, 0.55), 0.32, "xy", "line")
    return out + path3d([(0.5, 0.5, 0), (0.5, 0.5, 0.15)], "line")


def sym_dirt_separator() -> str:
    out = cylinder_v(0.5, 0.5, 0.05, 0.3, 0.75)
    out += path3d([(0.5, 0.5, 0.05), (0.5, 0.5, -0.25)], "line")
    return out + path3d([(0.4, 0.5, -0.25), (0.6, 0.5, -0.25)], "line")


def sym_energy_meter() -> str:
    out = circle_path((0.5, 0.5, AXIS), 0.3, "xz", "body")
    out += text(*project(0.5, 0.5, 0.36), "kWh", "tag t", "middle")
    return out + path3d([(0.5, 0.5, 0.7), (0.5, 0.5, 0.95)], "line")


Ports = list[tuple[int, int, str, str]]
IsoCard = tuple[
    str, str, tuple[int, int], Callable[[], str], Ports, list[tuple[list[Pt3], str]]
]

INLINE_RUN: list[Pt3] = [(-0.6, 0.5, AXIS), (1.6, 0.5, AXIS)]

ISO_CARDS: list[IsoCard] = [
    (
        "Pompe à chaleur",
        "heat_pump · 2×2",
        (2, 2),
        sym_heat_pump,
        [(1, 1, "+x", "supply"), (0, 1, "-x", "return")],
        [],
    ),
    (
        "Ballon",
        "tank · 1×2",
        (1, 2),
        sym_tank,
        [
            (0, 0, "-x", "primary_in"),
            (0, 1, "-x", "primary_out"),
            (0, 0, "+x", "dhw_out"),
            (0, 1, "+x", "dhw_in"),
        ],
        [],
    ),
    (
        "Nourrice",
        "collector · no footprint, length and ports authored",
        (4, 1),
        sym_collector,
        [
            (0, 0, "-x", "in_1"),
            (1, 0, "+y", "out_1"),
            (2, 0, "+y", "out_2"),
            (3, 0, "+y", "out_3"),
        ],
        [],
    ),
    (
        "Vanne 3 voies",
        "mixing_valve · 1×1",
        (1, 1),
        sym_mixing_valve,
        [(0, 0, "-x", "hot_in"), (0, 0, "+y", "cold_in"), (0, 0, "+x", "out")],
        [],
    ),
    (
        "Pompe simple",
        "pump · inline",
        (1, 1),
        sym_pump,
        [],
        [(INLINE_RUN, "fluid-primary-supply")],
    ),
    (
        "Vanne d'isolement",
        "valve_isolation · inline",
        (1, 1),
        sym_valve_isolation,
        [],
        [(INLINE_RUN, "fluid-primary-supply")],
    ),
    (
        "Clapet",
        "valve_check · inline",
        (1, 1),
        sym_valve_check,
        [],
        [(INLINE_RUN, "fluid-primary-supply")],
    ),
    (
        "Renvoi de folio",
        "link · 1×2",
        (1, 2),
        sym_link,
        [(0, 0, "-x", "in"), (0, 1, "-x", "out")],
        [],
    ),
    (
        "Échangeur à plaques",
        "not registered · 1×1 proposed",
        (1, 1),
        sym_exchanger,
        [
            (0, 0, "-x", "primary_in"),
            (0, 0, "+x", "primary_out"),
            (0, 0, "-y", "secondary_in"),
            (0, 0, "+y", "secondary_out"),
        ],
        [],
    ),
    (
        "Séparateur d'air",
        "not registered · inline proposed",
        (1, 1),
        sym_air_separator,
        [],
        [(INLINE_RUN, "fluid-heating-supply")],
    ),
    (
        "Vase d'expansion",
        "not registered · 1×1 proposed",
        (1, 1),
        sym_expansion_vessel,
        [(0, 0, "-x", "in")],
        [],
    ),
    (
        "Pot à boue",
        "not registered · inline proposed",
        (1, 1),
        sym_dirt_separator,
        [],
        [(INLINE_RUN, "fluid-heating-return")],
    ),
    (
        "Pompe double",
        "not registered · inline proposed",
        (1, 1),
        sym_pump_double,
        [],
        [(INLINE_RUN, "fluid-heating-supply")],
    ),
    (
        "Compteur d'énergie",
        "not registered · inline proposed",
        (1, 1),
        sym_energy_meter,
        [],
        [(INLINE_RUN, "fluid-heating-supply")],
    ),
]


def card(
    ox: float, oy: float, w: float, h: float, title: str, sub: str, draw: str
) -> str:
    out = f'<rect class="chip" x="{ox}" y="{oy}" width="{w}" height="{h}" rx="6"/>'
    out += text(ox + 12, oy + 20, title, "h t") + text(ox + 12, oy + 36, sub, "note tm")
    return (
        out
        + f'<g transform="translate({ox + w / 2:.1f} {oy + h / 2 + 30:.1f}) scale(1.15)">{draw}</g>'
    )


def iso_symbol_drawing(
    fp: tuple[int, int],
    draw: Callable[[], str],
    ports: Ports,
    pipes: list[tuple[list[Pt3], str]],
) -> str:
    w, d = fp
    cx, cy = project(w / 2, d / 2, 0)
    g = f'<g transform="translate({-cx:.1f} {-cy + 10:.1f})">' + footprint(0, 0, w, d)
    for cells, fluid in pipes:
        g += pipe_iso(cells, fluid)
    g += draw()
    for x, y, side, name in ports:
        g += port_mark(x, y, side, name)
    return g + "</g>"


Row = tuple[str, str, str, str]


def panel(
    x: float,
    y: float,
    title: str,
    state: str,
    fault: str,
    rows: list[Row],
    *,
    faulty: bool = False,
) -> str:
    """Equipment panel: ÉTAT / DÉFAUT header with LED, then one row per bound slot."""
    w, rh = 164, 20
    h = 46 + rh * len(rows) + 8
    out = f'<rect class="{"chip-fault" if faulty else "chip"}" x="{x}" y="{y}" width="{w}" height="{h}" rx="4"/>'
    out += text(x + 10, y + 16, title, "sym t")
    led = "status-error" if faulty else "status-ok"
    out += f'<circle style="fill:hsl(var(--{led}))" cx="{x + w - 12}" cy="{y + 11}" r="4"/>'
    out += text(x + 10, y + 32, "ÉTAT", "tag tm") + text(x + 38, y + 32, state, "tag t")
    out += text(x + 86, y + 32, "DÉFAUT", "tag tm") + text(
        x + 128, y + 32, fault, "tag te" if faulty else "tag t"
    )
    out += f'<line class="leader" x1="{x + 8}" y1="{y + 40}" x2="{x + w - 8}" y2="{y + 40}"/>'
    for i, (label, value, unit, row_state) in enumerate(rows):
        yy = y + 46 + rh * i + 13
        stale = row_state == "stale"
        out += text(x + 10, yy, label, "tag tm")
        vx = x + w - 10 - 6.5 * len(unit) - 4
        out += text(vx, yy, value, "val tm" if stale else "val t", "end")
        out += text(x + w - 10, yy, unit, "unit tm", "end")
        if stale:
            out += f'<circle class="tm" cx="{vx - 7.2 * len(value) - 8}" cy="{yy - 4}" r="2.5"/>'
    return out


def isometric_sheet() -> str:
    width, height = 1040, 1760
    out = [text(24, 36, "Synoptic kit · isometric hydronic set", "title t")]
    out.append(
        text(
            24,
            56,
            "one cell = 80 × 40 px, z = 40 px · pipe axis at z 0.4 · ports marked on the footprint face they leave through",
            "note tm",
        )
    )
    cw, ch, gap = 240, 250, 12
    for i, (title, sub, fp, draw, ports, pipes) in enumerate(ISO_CARDS):
        ox, oy = 24 + (i % 4) * (cw + gap), 76 + (i // 4) * (ch + gap)
        out.append(
            card(ox, oy, cw, ch, title, sub, iso_symbol_drawing(fp, draw, ports, pipes))
        )

    oy = 76 + 4 * (ch + gap)
    out.append(text(24, oy + 8, "States", "caption tm"))
    ox = 24
    out.append(
        panel(
            ox,
            oy + 20,
            "PAC 03",
            "MARCHE",
            "NORMAL",
            [("DÉPART", "52,4", "°C", "ok"), ("PUISSANCE", "38,2", "kW", "ok")],
        )
    )
    out.append(text(ox, oy + 132, "panel · live", "note tm"))
    out.append(
        panel(
            ox + 180,
            oy + 20,
            "PAC 04",
            "MARCHE",
            "NORMAL",
            [("DÉPART", "51,9", "°C", "stale"), ("PUISSANCE", "36,0", "kW", "ok")],
        )
    )
    out.append(text(ox + 180, oy + 132, "panel · one row stale", "note tm"))
    out.append(
        panel(
            ox + 360,
            oy + 20,
            "PAC 03",
            "ARRÊT",
            "DÉFAUT",
            [("DÉPART", "31,0", "°C", "ok"), ("PUISSANCE", "0,0", "kW", "ok")],
            faulty=True,
        )
    )
    out.append(text(ox + 360, oy + 132, "panel · device faulty", "note tm"))
    g = f'<g transform="translate({ox + 530} {oy + 40})">'
    g += pipe_iso([(0, 0, AXIS), (5, 0, AXIS)], "fluid-dhw", flow=True)
    g += tag_iso((0, -1, 0.0), "fluid-dhw", "TT-05", "55,1", "°C", "ok")
    g += tag_iso((2, -1, 0.0), "fluid-dhw", "TT-06", "49,8", "°C", "stale")
    g += tag_iso((4, -1, 0.0), "fluid-dhw", "FT-01", "2,4", "m³/h", "fault")
    out.append(g + "</g>")
    out.append(
        text(
            ox + 530,
            oy + 132,
            "tag · live / stale (dashed, muted) / faulty device (error stroke)",
            "note tm",
        )
    )
    g = (
        f'<g transform="translate({ox + 860} {oy + 40})">'
        + footprint(0, 0, 1, 2)
        + sym_tank(1.6)
    )
    g += path3d(circle3d((0.5, 1, 1.6), 0.5, "xy"), "fault", close=True)
    bx, by = project(1.1, 0.3, 1.6)
    g += f'<circle style="fill:hsl(var(--status-error))" cx="{bx:.1f}" cy="{by:.1f}" r="7"/>'
    g += f'<text class="tag" style="fill:hsl(var(--card))" x="{bx:.1f}" y="{by + 3.5:.1f}" text-anchor="middle">!</text>'
    out.append(g + "</g>")
    out.append(text(ox + 860, oy + 132, "symbol · device faulty", "note tm"))

    oy += 160
    out.append(
        text(
            24,
            oy + 8,
            "Fluids · supply saturated, return same hue desaturated and darker",
            "caption tm",
        )
    )
    for i, f in enumerate(FLUIDS):
        x, y = 24 + (i % 4) * 240, oy + 36 + (i // 4) * 40
        out.append(
            pipe(
                [(x, y), (x + 70, y)], f, flow=f.endswith("supply") or f == "fluid-dhw"
            )
        )
        out.append(text(x + 80, y + 3, f.removeprefix("fluid-"), "tag tm"))

    oy += 170
    out.append(
        text(
            24,
            oy + 8,
            "Runs · tee (no junction symbol), crossing at z 1 (casing halo), arrow at the `to` end only",
            "caption tm",
        )
    )
    g = f'<g transform="translate(140 {oy + 50})">'
    g += pipe_iso([(0, 0, AXIS), (6, 0, AXIS)], "fluid-primary-return")
    g += pipe_iso([(3, 0, AXIS), (3, 2, AXIS)], "fluid-primary-return")
    tx, ty = project(3, 0, AXIS)
    g += f'<circle style="fill:hsl(var(--fluid-primary-return))" cx="{tx:.1f}" cy="{ty:.1f}" r="4.5"/>'
    out.append(g + "</g>")
    g = f'<g transform="translate(640 {oy + 110})">'
    g += pipe_iso([(0, 1, AXIS), (6, 1, AXIS)], "fluid-cold-water")
    g += pipe_iso(
        [
            (3, -1, AXIS),
            (3, 0.4, AXIS),
            (3, 0.4, 1.4),
            (3, 1.6, 1.4),
            (3, 1.6, AXIS),
            (3, 3, AXIS),
        ],
        "fluid-heating-return",
    )
    out.append(g + "</g>")
    return sheet(width, height, "\n".join(out))


# ── flat set ─────────────────────────────────────────────────────────────────


def fpoly(points: Iterable[Pt], cls: str) -> str:
    return f'<polygon class="{cls}" points="{pts(points)}"/>'


def fgrid(x: float, y: float, w: int, d: int) -> str:
    return "".join(
        f'<rect class="grid" x="{x + i * FC}" y="{y + j * FC}" width="{FC}" height="{FC}"/>'
        for i in range(w)
        for j in range(d)
    )


def fport(cx: float, cy: float, side: str, name: str) -> str:
    ox, oy = SIDE_OFFSET[side]
    px, py = cx + ox * FC, cy + oy * FC
    ly = py + oy * FC * 0.55 + (4 if oy > 0 else -2 if oy < 0 else 3)
    anchor = "start" if ox > 0 else "end" if ox < 0 else "middle"
    return f'<circle class="port" cx="{px:.1f}" cy="{py:.1f}" r="3.5"/>' + text(
        px + ox * FC * 0.55, ly, name, "tag tm", anchor
    )


def fvalve(cx: float, cy: float, *, tee: bool = False) -> str:
    r = 12
    out = fpoly(
        [
            (cx - r, cy - r * 0.7),
            (cx - r, cy + r * 0.7),
            (cx + r, cy - r * 0.7),
            (cx + r, cy + r * 0.7),
        ],
        "body",
    )
    if tee:
        out += fpoly([(cx, cy), (cx - r * 0.7, cy + r), (cx + r * 0.7, cy + r)], "body")
    return (
        out
        + f'<line class="line" x1="{cx}" y1="{cy}" x2="{cx}" y2="{cy - 18}"/><line class="line" x1="{cx - 6}" y1="{cy - 18}" x2="{cx + 6}" y2="{cy - 18}"/>'
    )


def fpump(cx: float, cy: float, r: float = 13) -> str:
    return f'<circle class="body" cx="{cx}" cy="{cy}" r="{r}"/>' + fpoly(
        [
            (cx - r * 0.5, cy - r * 0.6),
            (cx - r * 0.5, cy + r * 0.6),
            (cx + r * 0.75, cy),
        ],
        "fill",
    )


def flat_heat_pump(cx: float, cy: float) -> str:
    out = f'<rect class="body" x="{cx - 44}" y="{cy - 44}" width="88" height="88" rx="4"/>'
    out += f'<circle class="line" cx="{cx}" cy="{cy}" r="26"/><circle class="fill" cx="{cx}" cy="{cy}" r="3"/>'
    for k in range(3):
        t = 2 * math.pi * k / 3
        out += f'<line class="line" x1="{cx}" y1="{cy}" x2="{cx + 22 * math.cos(t):.1f}" y2="{cy + 22 * math.sin(t):.1f}"/>'
    return out


def flat_tank(cx: float, cy: float) -> str:
    return f'<rect class="body" x="{cx - 18}" y="{cy - 46}" width="36" height="92" rx="18"/><line class="line" x1="{cx - 18}" y1="{cy - 28}" x2="{cx + 18}" y2="{cy - 28}"/>'


def flat_collector(cx: float, cy: float, n: int = 4) -> str:
    return f'<rect class="body" x="{cx - n * FC / 2}" y="{cy - 9}" width="{n * FC}" height="18" rx="9"/>'


def flat_link(cx: float, cy: float) -> str:
    out = fpoly(
        [
            (cx - 22, cy - 46),
            (cx + 22, cy - 46),
            (cx + 22, cy + 30),
            (cx, cy + 46),
            (cx - 22, cy + 30),
        ],
        "body",
    )
    return (
        out
        + text(cx, cy + 2, "ECS", "tag t", "middle")
        + text(cx, cy + 14, "OUEST", "tag t", "middle")
    )


def flat_exchanger(cx: float, cy: float) -> str:
    return f'<rect class="body" x="{cx - 20}" y="{cy - 20}" width="40" height="40"/><line class="line" x1="{cx - 20}" y1="{cy - 20}" x2="{cx + 20}" y2="{cy + 20}"/>'


def flat_air_sep(cx: float, cy: float) -> str:
    return f'<circle class="body" cx="{cx}" cy="{cy}" r="14"/><line class="line" x1="{cx}" y1="{cy - 14}" x2="{cx}" y2="{cy - 24}"/><circle class="body" cx="{cx}" cy="{cy - 27}" r="3.5"/>'


def flat_exp_vessel(cx: float, cy: float) -> str:
    return f'<circle class="body" cx="{cx}" cy="{cy - 4}" r="15"/><line class="line" x1="{cx - 15}" y1="{cy - 4}" x2="{cx + 15}" y2="{cy - 4}"/><line class="line" x1="{cx}" y1="{cy + 11}" x2="{cx}" y2="{cy + 22}"/>'


def flat_dirt_sep(cx: float, cy: float) -> str:
    return f'<circle class="body" cx="{cx}" cy="{cy}" r="14"/><line class="line" x1="{cx}" y1="{cy + 14}" x2="{cx}" y2="{cy + 24}"/><line class="line" x1="{cx - 5}" y1="{cy + 24}" x2="{cx + 5}" y2="{cy + 24}"/>'


def flat_meter(cx: float, cy: float) -> str:
    return f'<circle class="body" cx="{cx}" cy="{cy}" r="14"/>' + text(
        cx, cy + 3, "kWh", "tag t", "middle"
    )


def flat_pump_double(cx: float, cy: float) -> str:
    return fpump(cx, cy - 11, 11) + fpump(cx, cy + 11, 11)


def flat_valve_check(cx: float, cy: float) -> str:
    return fvalve(cx, cy) + f'<circle class="fill" cx="{cx + 6}" cy="{cy}" r="3.5"/>'


def flat_mixing_valve(cx: float, cy: float) -> str:
    return fvalve(cx, cy, tee=True)


FlatCard = tuple[
    str, str, tuple[int, int], Callable[[float, float], str], Ports, str | None
]

FLAT_CARDS: list[FlatCard] = [
    (
        "Pompe à chaleur",
        "heat_pump · 2×2",
        (2, 2),
        flat_heat_pump,
        [(1, 1, "+x", "supply"), (0, 1, "-x", "return")],
        None,
    ),
    (
        "Ballon",
        "tank · 1×2",
        (1, 2),
        flat_tank,
        [
            (0, 0, "-x", "primary_in"),
            (0, 1, "-x", "primary_out"),
            (0, 0, "+x", "dhw_out"),
            (0, 1, "+x", "dhw_in"),
        ],
        None,
    ),
    (
        "Nourrice",
        "collector · no footprint, length authored",
        (4, 1),
        flat_collector,
        [
            (0, 0, "-x", "in_1"),
            (1, 0, "+y", "out_1"),
            (2, 0, "+y", "out_2"),
            (3, 0, "+y", "out_3"),
        ],
        None,
    ),
    (
        "Vanne 3 voies",
        "mixing_valve · 1×1",
        (1, 1),
        flat_mixing_valve,
        [(0, 0, "-x", "hot_in"), (0, 0, "+y", "cold_in"), (0, 0, "+x", "out")],
        None,
    ),
    ("Pompe simple", "pump · inline", (1, 1), fpump, [], "fluid-primary-supply"),
    (
        "Vanne d'isolement",
        "valve_isolation · inline",
        (1, 1),
        fvalve,
        [],
        "fluid-primary-supply",
    ),
    (
        "Clapet",
        "valve_check · inline",
        (1, 1),
        flat_valve_check,
        [],
        "fluid-primary-supply",
    ),
    (
        "Renvoi de folio",
        "link · 1×2",
        (1, 2),
        flat_link,
        [(0, 0, "-x", "in"), (0, 1, "-x", "out")],
        None,
    ),
    (
        "Échangeur à plaques",
        "not registered",
        (1, 1),
        flat_exchanger,
        [
            (0, 0, "-x", "primary_in"),
            (0, 0, "+x", "primary_out"),
            (0, 0, "-y", "secondary_in"),
            (0, 0, "+y", "secondary_out"),
        ],
        None,
    ),
    (
        "Séparateur d'air",
        "not registered · inline",
        (1, 1),
        flat_air_sep,
        [],
        "fluid-heating-supply",
    ),
    (
        "Vase d'expansion",
        "not registered",
        (1, 1),
        flat_exp_vessel,
        [(0, 0, "-x", "in")],
        None,
    ),
    (
        "Pot à boue",
        "not registered · inline",
        (1, 1),
        flat_dirt_sep,
        [],
        "fluid-heating-return",
    ),
    (
        "Pompe double",
        "not registered · inline",
        (1, 1),
        flat_pump_double,
        [],
        "fluid-heating-supply",
    ),
    (
        "Compteur d'énergie",
        "not registered · inline",
        (1, 1),
        flat_meter,
        [],
        "fluid-heating-supply",
    ),
]


def flat_symbol_drawing(
    fp: tuple[int, int],
    draw: Callable[[float, float], str],
    ports: Ports,
    inline: str | None,
) -> str:
    w, d = fp
    x0, y0 = -w * FC / 2, -d * FC / 2
    g = fgrid(x0, y0, w, d)
    if inline:
        g += pipe([(x0 - 30, 0), (x0 + w * FC + 30, 0)], inline)
    g += draw(0, 0)
    for px, py, side, name in ports:
        g += fport(x0 + px * FC + FC / 2, y0 + py * FC + FC / 2, side, name)
    return g


def fan_glyph(cx: float, cy: float, *, spinning: bool) -> str:
    fill = "hsl(var(--hvac-fan))" if spinning else "hsl(var(--muted-foreground))"
    out = f'<circle class="body" cx="{cx}" cy="{cy}" r="22"/><g transform="translate({cx} {cy})" style="fill:{fill}">'
    for a in (0, 120, 240):
        out += f'<path transform="rotate({a})" d="M0 -4 C7 -7 8 -17 0 -20 C-8 -17 -7 -7 0 -4 Z"/>'
    return out + f'</g><circle class="fill" cx="{cx}" cy="{cy}" r="3"/>'


def filter_glyph(cx: float, cy: float) -> str:
    z = " ".join(
        f"{cx + (-5 if i % 2 == 0 else 5)},{cy + dy}"
        for i, dy in enumerate((-20, -13, -6, 1, 8, 15, 22))
    )
    return f'<rect class="body" x="{cx - 13}" y="{cy - 24}" width="26" height="48" rx="3"/><polyline class="line" points="{z}"/>'


def coil_glyph(cx: float, cy: float, fluid: str) -> str:
    out = f'<rect class="body" x="{cx - 14}" y="{cy - 24}" width="28" height="48" rx="2" style="stroke:hsl(var(--{fluid}))"/>'
    for dx in (-7, 0, 7):
        out += f'<line x1="{cx + dx}" y1="{cy - 19}" x2="{cx + dx}" y2="{cy + 19}" style="stroke:hsl(var(--{fluid}));stroke-width:1.5"/>'
    return out


def damper_glyph(cx: float, cy: float) -> str:
    out = (
        f'<rect class="body" x="{cx - 8}" y="{cy - 24}" width="16" height="48" rx="2"/>'
    )
    for dy in (-14, 0, 14):
        out += f'<line class="line" x1="{cx - 6}" y1="{cy + dy - 5}" x2="{cx + 6}" y2="{cy + dy + 5}"/>'
    return out


def flat_sheet() -> str:
    width, height = 1040, 1250
    out = [text(24, 36, "Synoptic kit · flat set", "title t")]
    out.append(
        text(
            24,
            56,
            "one cell = 48 px · same tokens, strokes and chips as the isometric set · the shipped AHU glyphs restyled below",
            "note tm",
        )
    )
    cw, ch, gap = 240, 200, 12
    for i, (title, sub, fp, draw, ports, inline) in enumerate(FLAT_CARDS):
        ox, oy = 24 + (i % 4) * (cw + gap), 76 + (i // 4) * (ch + gap)
        out.append(
            card(
                ox, oy, cw, ch, title, sub, flat_symbol_drawing(fp, draw, ports, inline)
            )
        )

    oy = 76 + 4 * (ch + gap)
    out.append(
        text(
            24,
            oy + 8,
            "Distribution view · AHU duct glyphs in the same language (fan, filter, coils, damper, chip)",
            "caption tm",
        )
    )
    g = f'<g transform="translate(60 {oy + 80})"><rect class="body" x="0" y="-26" width="900" height="52" rx="3"/>'
    g += damper_glyph(40, 0) + filter_glyph(120, 0) + fan_glyph(220, 0, spinning=True)
    g += coil_glyph(330, 0, "fluid-heating-supply") + coil_glyph(
        400, 0, "fluid-chilled-supply"
    )
    g += fan_glyph(520, 0, spinning=False)
    for x in (640, 760, 870):
        g += f'<path class="line" d="M {x - 6} -8 L {x + 6} 0 L {x - 6} 8"/>'
    chips = [
        (120, "ΔP", "142", "Pa", "ok"),
        (220, "VENT", "MARCHE", "", "ok"),
        (330, "V-CH", "35", "%", "ok"),
        (400, "V-FR", "0", "%", "stale"),
        (700, "TT-SOUF", "19,5", "°C", "ok"),
    ]
    for x, label, value, unit, state in chips:
        g += (
            chip(x, 62, label, value, unit, state)
            + f'<line class="leader" x1="{x}" y1="26" x2="{x}" y2="40"/>'
        )
    out.append(g + "</g>")

    oy += 190
    out.append(
        text(
            24,
            oy + 8,
            "Labels · title / caption / note, and a label with a value",
            "caption tm",
        )
    )
    out.append(text(24, oy + 44, "PRODUCTION ECS EST", "title t"))
    out.append(text(24, oy + 70, "9 × 500 L", "caption tm"))
    out.append(
        text(
            24,
            oy + 90,
            "Bouclage repris en sous-sol, vanne V-12 fermée en été",
            "note tm",
        )
    )
    out.append(
        text(500, oy + 44, "Extérieur", "caption tm")
        + chip(600, oy + 40, "", "12,3", "°C")
    )
    return sheet(width, height, "\n".join(out))


# ── density sketch ───────────────────────────────────────────────────────────


def departures(ox: float, oy: float, *, alternate: bool) -> str:
    n, length = 8, 10
    g = f'<g transform="translate({ox} {oy})">' + footprint(0, 0, length, 1)
    g += pipe_iso([(-2, 0.5, AXIS), (0, 0.5, AXIS)], "fluid-primary-supply", flow=True)
    g += sym_collector(length)
    for i in range(n):
        x = i + 1
        g += pipe_iso(
            [(x + 0.5, 1, AXIS), (x + 0.5, 4.6, AXIS)],
            "fluid-primary-supply",
            flow=i % 3 != 1,
        )
        g += valve_body(x + 0.5, 1.5, AXIS, axis="y")
        side = "below" if alternate and i % 2 else "above"
        cell: Pt3 = (x, 3, 0) if alternate else (x, 2, 0)
        value = f"{51 + i * 0.7:.1f}".replace(".", ",")
        g += tag_iso(
            cell,
            "fluid-primary-supply",
            f"TT-{i + 1:02d}",
            value,
            "°C",
            "stale" if i == 5 else "ok",
            side,
        )
    return g + port_mark(0, 0, "-x", "in_1") + "</g>"


def density_sheet() -> str:
    width, height = 1240, 560
    out = [
        text(
            24,
            36,
            "Density sketch · collector, eight departures, value tags",
            "title t",
        )
    ]
    out.append(
        text(
            24,
            56,
            "left: departures at 1-cell pitch, tags on one side collide (chip 60 px vs 40 px step) · right: alternate sides, valve and tag two cells apart",
            "note tm",
        )
    )
    out.append(departures(280, 150, alternate=False))
    out.append(departures(800, 150, alternate=True))
    out.append(
        text(
            24,
            530,
            "Finding: text needs two cells of pitch along a run or alternating sides across parallel runs; pipes themselves are fine at one cell.",
            "note tm",
        )
    )
    return sheet(width, height, "\n".join(out))


if __name__ == "__main__":
    (OUT / "isometric.svg").write_text(isometric_sheet())
    (OUT / "flat.svg").write_text(flat_sheet())
    (OUT / "density-collector-8.svg").write_text(density_sheet())
