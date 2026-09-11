"""Generate the synoptic kit sheets next to this file.

Run from the repo root: ``uv run python docs/specs/synoptic/kit/generate.py``.

Token values are read from ``apps/ui/src/index.css`` so the sheets preview the
app's own palette, and the fluid palette is checked for colour distance before
anything is written. Each symbol has one plan glyph; the flat sheet draws it as
is, the isometric sheet projects the same glyph and gives it height. The
geometry follows ``docs/specs/synoptic-visual-language.md``.
"""

import colorsys
import itertools
import math
import re
from collections.abc import Callable, Iterable, Sequence
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = next(p for p in OUT.parents if (p / ".git").exists())
INDEX_CSS = ROOT / "apps/ui/src/index.css"

# 2:1 dimetric projection, one cell = 80 x 40 px diamond, 40 px per z unit.
SX, SY, SZ = 40, 20, 40
# Flat projection, one cell = 48 px.
FC = 48
# Pipe axis height inside a cell, and the plane inline glyphs are drawn on.
AXIS = 0.4

# CIE76 floors: fluids against the two status colours a plate draws, and the
# fluid set against itself. Eleven fluids in a 45-55 % band on six hues cannot
# all sit 25 apart in the dark theme; 18 is what the palette reaches there.
STATUS_DELTA_E = 25
FLUID_DELTA_E = 18

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
Palette = dict[str, str]


# ── tokens and colour distance ───────────────────────────────────────────────


def read_tokens() -> tuple[Palette, Palette]:
    """Light and dark ``H S% L%`` triplets of ``TOKENS`` from ``index.css``.

    A token defined as ``var(--other)`` takes the other token's triplet, one
    level deep: an alias of an alias is not resolved.
    """
    light_block, dark_block = INDEX_CSS.read_text().split(".dark {", 1)

    def pick(block: str) -> Palette:
        values: Palette = {}
        for t in TOKENS:
            match = re.search(rf"--{t}: ([^;]+);", block)
            if match is None:
                msg = f"--{t} is not defined in {INDEX_CSS}"
                raise ValueError(msg)
            values[t] = match.group(1)
        for t, v in values.items():
            alias = re.fullmatch(r"var\(--([a-z-]+)\)", v)
            if alias:
                values[t] = values[alias.group(1)]
        return values

    return pick(light_block), pick(dark_block)


def hsl_to_lab(triplet: str) -> tuple[float, float, float]:
    """``"H S% L%"`` to CIE-Lab (D65), for perceptual distance."""
    h, s, lightness = (float(v.rstrip("%")) for v in triplet.split())
    rgb = colorsys.hls_to_rgb(h / 360, lightness / 100, s / 100)
    r, g, b = (c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    fx, fy, fz = (
        t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116 for t in (x, y, z)
    )
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def delta_e(a: str, b: str) -> float:
    return math.dist(hsl_to_lab(a), hsl_to_lab(b))


def check_palette(values: Palette, theme: str) -> None:
    """Refuse a palette where a fluid could be mistaken for a status or for another fluid."""
    failures = []
    for fluid in FLUIDS:
        for status in ("status-error", "status-ok"):
            d = delta_e(values[fluid], values[status])
            if d < STATUS_DELTA_E:
                failures.append(f"{fluid} vs {status}: {d:.1f} < {STATUS_DELTA_E}")
    for a, b in itertools.combinations(FLUIDS, 2):
        d = delta_e(values[a], values[b])
        if d < FLUID_DELTA_E:
            failures.append(f"{a} vs {b}: {d:.1f} < {FLUID_DELTA_E}")
    if failures:
        msg = f"{theme} palette too close (CIE76):\n  " + "\n  ".join(failures)
        raise ValueError(msg)


# ── stylesheet ───────────────────────────────────────────────────────────────

# Rules are grouped so shared declarations are written once; only the classes a
# sheet uses are emitted. Weights: pipe 3, symbol outline 2, detail 1.25,
# leader 1. The plate fill on faces occludes what sits behind a symbol.
RULES: list[tuple[tuple[str, ...], str]] = [
    (("plate",), "fill:hsl(var(--synoptic-plate))"),
    (("grid",), "stroke:hsl(var(--synoptic-grid));stroke-width:1;fill:none"),
    (
        ("face", "outline", "detail", "duct"),
        "stroke:hsl(var(--synoptic-stroke));stroke-linejoin:round;stroke-linecap:round",
    ),
    (("face", "outline"), "stroke-width:2"),
    (("face",), "fill:hsl(var(--synoptic-plate))"),
    (("outline", "detail"), "fill:none"),
    (("detail",), "stroke-width:1.25"),
    (("duct",), "fill:hsl(var(--synoptic-body));stroke-width:1.5"),
    (("fill",), "fill:hsl(var(--synoptic-stroke))"),
    (
        ("port",),
        "fill:hsl(var(--card));stroke:hsl(var(--synoptic-stroke));stroke-width:1.5",
    ),
    (("casing", "pipe"), "fill:none;stroke-linejoin:round;stroke-linecap:butt"),
    (("casing",), "stroke:hsl(var(--synoptic-plate));stroke-width:7"),
    (("pipe",), "stroke-width:3"),
    (
        ("flow",),
        "stroke:hsl(var(--synoptic-plate));stroke-width:1;fill:none;"
        "stroke-dasharray:3 9;animation:flow 1s linear infinite",
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


def style(body: str, light: Palette, dark: Palette) -> str:
    used = {
        c for classes in re.findall(r'class="([^"]+)"', body) for c in classes.split()
    }

    def block(values: Palette) -> str:
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
        "@keyframes flow{to{stroke-dashoffset:-12}}\n"
        "@media (prefers-reduced-motion: reduce){.flow{animation:none}}\n"
        "</style>"
    )


def sheet(width: int, height: int, body: str, palettes: tuple[Palette, Palette]) -> str:
    body = f'<rect class="plate" width="{width}" height="{height}"/>\n{body}'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">\n{style(body, *palettes)}\n{body}\n</svg>\n'
    )


# ── screen-space primitives ──────────────────────────────────────────────────


def project(x: float, y: float, z: float = 0.0) -> Pt:
    return ((x - y) * SX, (x + y) * SY - z * SZ)


def flat(x: float, y: float) -> Pt:
    return (x * FC, y * FC)


def pts(points: Iterable[Pt]) -> str:
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in points)


def spath(points: Iterable[Pt], cls: str, *, close: bool = False) -> str:
    d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in points)
    return f'<path class="{cls}" d="{d}{" Z" if close else ""}"/>'


def text(x: float, y: float, s: str, cls: str = "t", anchor: str = "start") -> str:
    """One ``<text>`` per line; a newline in ``s`` stacks lines 12 px apart."""
    return "".join(
        f'<text class="{cls}" x="{x:.1f}" y="{y + 12 * i:.1f}" text-anchor="{anchor}">{line}</text>'
        for i, line in enumerate(s.split("\n"))
    )


def circle_pts(c: Pt, r: float, n: int = 40) -> list[Pt]:
    return [
        (
            c[0] + r * math.cos(2 * math.pi * i / n),
            c[1] + r * math.sin(2 * math.pi * i / n),
        )
        for i in range(n)
    ]


def arrow_head(a: Pt, b: Pt, fluid: str, ln: float = 8, w: float = 6) -> str:
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
    out = f'<path class="casing" d="{d}"/><path class="pipe" style="stroke:hsl(var(--{fluid}))" d="{d}"/>'
    if flow:
        out += f'<path class="flow" d="{d}"/>'
    if arrow:
        out += arrow_head(points[-2], points[-1], fluid)
    return out


def pipe_iso(
    cells: Sequence[Pt3], fluid: str, *, arrow: bool = True, flow: bool = False
) -> str:
    return pipe([project(*c) for c in cells], fluid, arrow=arrow, flow=flow)


# ── plan glyphs, drawn on a plane ────────────────────────────────────────────


class Plane:
    """Plan-view drawing surface: the flat sheet, or a horizontal plane at
    height ``z`` of the isometric view. Plan coordinates are cells."""

    def __init__(self, to_screen: Callable[[float, float], Pt]) -> None:
        self.to = to_screen

    def poly(self, points: Iterable[Pt], cls: str = "outline") -> str:
        return spath([self.to(*p) for p in points], cls, close=True)

    def line(self, a: Pt, b: Pt, cls: str = "detail") -> str:
        return spath([self.to(*a), self.to(*b)], cls)

    def circle(self, c: Pt, r: float, cls: str = "outline") -> str:
        return self.poly(circle_pts(c, r), cls)

    def dot(self, c: Pt, r: float) -> str:
        return self.poly(circle_pts(c, r), "fill")


def iso_plane(z: float) -> Plane:
    return Plane(lambda x, y: project(x, y, z))


def rot(points: Iterable[Pt], c: Pt, d: Pt) -> list[Pt]:
    """Turn points authored for a +x run so they follow direction ``d`` about ``c``."""
    return [
        (c[0] + px * d[0] - py * d[1], c[1] + px * d[1] + py * d[0])
        for px, py in points
    ]


def valve_glyph(p: Plane, c: Pt, d: Pt = (1, 0), *, tee: bool = False) -> str:
    """ISA bowtie across the run. The third port of a mixing valve is on +y."""
    r = 0.26
    out = p.poly(
        rot([(-r, -r * 0.7), (-r, r * 0.7), (r, -r * 0.7), (r, r * 0.7)], c, d)
    )
    if tee:
        out += p.poly(rot([(0, 0), (-r * 0.7, r), (r * 0.7, r)], c, d))
    return out


def pump_glyph(p: Plane, c: Pt, d: Pt = (1, 0), r: float = 0.3) -> str:
    """ISA pump: circle with the impeller triangle pointing downstream."""
    tri = rot([(-r * 0.45, -r * 0.55), (-r * 0.45, r * 0.55), (r * 0.7, 0)], c, d)
    return p.circle(c, r) + p.poly(tri, "detail")


def air_separator_glyph(p: Plane, c: Pt) -> str:
    """Circle, a mesh of three chevrons, air collecting at the top."""
    out = p.circle(c, 0.3)
    for dy in (-0.1, 0.02, 0.14):
        out += p.line((c[0] - 0.16, c[1] + dy + 0.06), (c[0], c[1] + dy - 0.04))
        out += p.line((c[0], c[1] + dy - 0.04), (c[0] + 0.16, c[1] + dy + 0.06))
    return out


def dirt_separator_glyph(p: Plane, c: Pt) -> str:
    """Circle with a settling cone: dirt collects at the bottom."""
    out = p.circle(c, 0.3)
    out += p.poly(
        [(c[0] - 0.2, c[1] - 0.02), (c[0] + 0.2, c[1] - 0.02), (c[0], c[1] + 0.24)],
        "detail",
    )
    return out


def meter_glyph(p: Plane, c: Pt) -> str:
    """Energy meter: a square housing with the register window."""
    s = 0.3
    out = p.poly(
        [
            (c[0] - s, c[1] - s),
            (c[0] + s, c[1] - s),
            (c[0] + s, c[1] + s),
            (c[0] - s, c[1] + s),
        ]
    )
    out += p.poly(
        [
            (c[0] - 0.18, c[1] - 0.12),
            (c[0] + 0.18, c[1] - 0.12),
            (c[0] + 0.18, c[1] + 0.02),
            (c[0] - 0.18, c[1] + 0.02),
        ],
        "detail",
    )
    return out


def capsule_pts(c: Pt, r: float = 0.24, dy: float = 0.14) -> list[Pt]:
    arc = [math.pi * i / 20 for i in range(21)]
    top = [(c[0] + r * math.cos(t), c[1] - dy - r * math.sin(t)) for t in arc]
    bot = [(c[0] - r * math.cos(t), c[1] + dy + r * math.sin(t)) for t in arc]
    return top + bot


def expansion_vessel_glyph(p: Plane, c: Pt) -> str:
    """Capsule with the diaphragm line, drawn as the trade draws it."""
    return p.poly(capsule_pts(c)) + p.line((c[0] - 0.24, c[1]), (c[0] + 0.24, c[1]))


def link_glyph(p: Plane, c: Pt) -> str:
    """Off-page connector, pointing the way flow leaves the plate (-x)."""
    return p.poly(
        [
            (c[0] - 0.1, c[1] - 1),
            (c[0] + 0.4, c[1] - 1),
            (c[0] + 0.4, c[1] + 1),
            (c[0] - 0.1, c[1] + 1),
            (c[0] - 0.45, c[1]),
        ]
    )


def fan_glyph(p: Plane, c: Pt, r: float) -> str:
    out = p.circle(c, r, "detail") + p.dot(c, r * 0.1)
    for k in range(3):
        t = 2 * math.pi * k / 3
        out += p.line(c, (c[0] + r * 0.85 * math.cos(t), c[1] + r * 0.85 * math.sin(t)))
    return out


# ── isometric extrusion ──────────────────────────────────────────────────────


def visible_arc(points: list[Pt], z: float) -> list[int]:
    """Indices of a plan outline's points that face the viewer, leftmost to
    rightmost on screen: the vertical silhouette edges rise from its ends."""
    proj = [project(x, y, z) for x, y in points]
    li = min(range(len(proj)), key=lambda i: proj[i][0])
    ri = max(range(len(proj)), key=lambda i: proj[i][0])

    def walk(step: int) -> list[int]:
        idx, i = [], li
        while True:
            idx.append(i)
            if i == ri:
                return idx
            i = (i + step) % len(points)

    fwd = walk(1)
    centre_y = sum(p[1] for p in proj) / len(proj)
    return fwd if sum(proj[i][1] for i in fwd) / len(fwd) >= centre_y else walk(-1)


def extrude(outline: list[Pt], z0: float, z1: float) -> str:
    """A plan outline given height: the visible side as one plate-filled face,
    then the top face. Hidden edges are not drawn."""
    idx = visible_arc(outline, z1)
    side = [project(*outline[i], z0) for i in idx] + [
        project(*outline[i], z1) for i in reversed(idx)
    ]
    return spath(side, "face", close=True) + spath(
        [project(*q, z1) for q in outline], "face", close=True
    )


def square(x: float, y: float, w: float, d: float) -> list[Pt]:
    return [(x, y), (x + w, y), (x + w, y + d), (x, y + d)]


def cylinder_x(x0: float, x1: float, y: float, z: float, r: float) -> str:
    """Horizontal cylinder along x, hairline: the collector bar."""
    ring = [
        (y + r * math.cos(t), z + r * math.sin(t))
        for t in (2 * math.pi * i / 40 for i in range(40))
    ]
    a = [project(x0, py, pz) for py, pz in ring]
    b = [project(x1, py, pz) for py, pz in ring]
    ax = (b[0][0] - a[0][0], b[0][1] - a[0][1])
    n = (-ax[1], ax[0])
    i0 = min(range(40), key=lambda i: a[i][0] * n[0] + a[i][1] * n[1])
    i1 = max(range(40), key=lambda i: a[i][0] * n[0] + a[i][1] * n[1])
    return (
        spath([a[i0], b[i0], b[i1], a[i1]], "face", close=True)
        + spath(b, "face", close=True)
        + spath(a, "outline", close=True)
    )


# ── symbols ──────────────────────────────────────────────────────────────────
# One plan glyph per type. ``height`` is the extrusion the isometric sheet adds,
# measured from ``base``; inline types sit on the pipe axis plane with no height.


class Symbol:
    def __init__(
        self,
        title: str,
        sub: str,
        footprint: tuple[int, int],
        plan: Callable[[Plane, Pt], str],
        *,
        ports: Sequence[tuple[int, int, str, str]] = (),
        inline: str | None = None,
        base: float = 0.0,
        height: float = 0.0,
        outline: Callable[[Pt], list[Pt]] | None = None,
        label: str | None = None,
        label_on_face: bool = False,
    ) -> None:
        self.title, self.sub, self.footprint, self.plan = title, sub, footprint, plan
        self.ports, self.inline, self.base, self.height = ports, inline, base, height
        self.outline, self.label, self.label_on_face = outline, label, label_on_face

    @property
    def centre(self) -> Pt:
        return (self.footprint[0] / 2, self.footprint[1] / 2)

    def draw_flat(self) -> str:
        return self.plan(Plane(flat), self.centre)

    def draw_iso(self) -> str:
        top = self.base + self.height
        out = ""
        if self.height and self.outline:
            out += extrude(self.outline(self.centre), self.base, top)
        elif self.inline:
            # Inline glyph on the axis plane: plate-fill so it breaks the run.
            out += iso_plane(top).poly(
                self.outline(self.centre)
                if self.outline
                else circle_pts(self.centre, 0.3),
                "face",
            )
        out += self.plan(iso_plane(top), self.centre)
        if self.label:
            lx, ly = project(*self.centre, top)
            if self.label_on_face:
                out += text(lx + 8, ly + 4, self.label, "sym t", "middle")
            else:
                out += text(
                    lx,
                    ly - 26 - (14 if self.height else 0),
                    self.label,
                    "sym t",
                    "middle",
                )
        return out


def heat_pump_plan(p: Plane, c: Pt) -> str:
    return p.poly(square(c[0] - 1, c[1] - 1, 2, 2)) + fan_glyph(p, c, 0.55)


def tank_plan(p: Plane, c: Pt) -> str:
    return p.circle(c, 0.45) + p.circle(c, 0.3, "detail")


def collector_plan(p: Plane, c: Pt) -> str:
    return p.poly(square(c[0] - 2, c[1] - 0.2, 4, 0.4))


def exchanger_plan(p: Plane, c: Pt) -> str:
    return p.poly(square(c[0] - 0.4, c[1] - 0.4, 0.8, 0.8)) + p.line(
        (c[0] - 0.4, c[1] - 0.4), (c[0] + 0.4, c[1] + 0.4)
    )


def pump_double_plan(p: Plane, c: Pt, d: Pt = (1, 0)) -> str:
    return pump_glyph(p, (c[0], c[1] - 0.24), d, 0.22) + pump_glyph(
        p, (c[0], c[1] + 0.24), d, 0.22
    )


def meter_plan(p: Plane, c: Pt) -> str:
    return meter_glyph(p, c)


SYMBOLS: list[Symbol] = [
    Symbol(
        "Pompe à chaleur",
        "heat_pump · 2×2",
        (2, 2),
        heat_pump_plan,
        ports=[(1, 1, "+x", "supply"), (0, 1, "-x", "return")],
        height=1.1,
        outline=lambda c: square(c[0] - 1, c[1] - 1, 2, 2),
    ),
    Symbol(
        "Ballon",
        "tank · 1×2",
        (1, 2),
        tank_plan,
        ports=[
            (0, 0, "-x", "primary_in"),
            (0, 1, "-x", "primary_out"),
            (0, 0, "+x", "dhw_out"),
            (0, 1, "+x", "dhw_in"),
        ],
        height=2.0,
        outline=lambda c: circle_pts(c, 0.45),
    ),
    Symbol(
        "Nourrice",
        "collector · no footprint, length and ports authored",
        (4, 1),
        collector_plan,
        ports=[
            (0, 0, "-x", "in_1"),
            (1, 0, "+y", "out_1"),
            (2, 0, "+y", "out_2"),
            (3, 0, "+y", "out_3"),
        ],
    ),
    Symbol(
        "Vanne 3 voies",
        "mixing_valve · 1×1",
        (1, 1),
        lambda p, c: valve_glyph(p, c, tee=True),
        ports=[(0, 0, "-x", "hot_in"), (0, 0, "+y", "cold_in"), (0, 0, "+x", "out")],
        base=AXIS,
        label="M",
    ),
    Symbol(
        "Pompe simple",
        "pump · inline",
        (1, 1),
        pump_glyph,
        inline="fluid-primary-supply",
        base=AXIS,
    ),
    Symbol(
        "Vanne d'isolement",
        "valve_isolation · inline",
        (1, 1),
        valve_glyph,
        inline="fluid-primary-supply",
        base=AXIS,
    ),
    Symbol(
        "Clapet",
        "valve_check · inline",
        (1, 1),
        lambda p, c: valve_glyph(p, c) + p.dot((c[0] + 0.1, c[1]), 0.07),
        inline="fluid-primary-supply",
        base=AXIS,
    ),
    Symbol(
        "Renvoi de folio",
        "link · 1×2",
        (1, 2),
        link_glyph,
        ports=[(0, 0, "-x", "in"), (0, 1, "-x", "out")],
        base=AXIS,
        label="ECS\nOUEST",
        label_on_face=True,
    ),
    Symbol(
        "Échangeur à plaques",
        "not registered · 1×1 proposed",
        (1, 1),
        exchanger_plan,
        ports=[
            (0, 0, "-x", "primary_in"),
            (0, 0, "+x", "primary_out"),
            (0, 0, "-y", "secondary_in"),
            (0, 0, "+y", "secondary_out"),
        ],
        height=1.1,
        outline=lambda c: square(c[0] - 0.4, c[1] - 0.4, 0.8, 0.8),
    ),
    Symbol(
        "Séparateur d'air",
        "not registered · inline proposed",
        (1, 1),
        air_separator_glyph,
        inline="fluid-heating-supply",
        base=AXIS,
    ),
    Symbol(
        "Vase d'expansion",
        "not registered · 1×1 proposed",
        (1, 1),
        expansion_vessel_glyph,
        ports=[(0, 0, "-x", "in")],
        height=0.8,
        outline=capsule_pts,
    ),
    Symbol(
        "Pot à boue",
        "not registered · inline proposed",
        (1, 1),
        dirt_separator_glyph,
        inline="fluid-heating-return",
        base=AXIS,
    ),
    Symbol(
        "Pompe double",
        "not registered · inline proposed",
        (1, 1),
        pump_double_plan,
        inline="fluid-heating-supply",
        base=AXIS,
    ),
    Symbol(
        "Compteur d'énergie",
        "not registered · inline proposed",
        (1, 1),
        meter_plan,
        inline="fluid-heating-supply",
        base=AXIS,
        label="kWh",
        outline=lambda c: square(c[0] - 0.3, c[1] - 0.3, 0.6, 0.6),
    ),
]


# ── sheet furniture: footprints, ports, chips, tags, panels ──────────────────

SIDE_OFFSET = {"+x": (0.5, 0.0), "-x": (-0.5, 0.0), "+y": (0.0, 0.5), "-y": (0.0, -0.5)}


def footprint_iso(w: int, d: int) -> str:
    return "".join(
        iso_plane(0).poly(square(i, j, 1, 1), "grid")
        for i in range(w)
        for j in range(d)
    )


def footprint_flat(w: int, d: int) -> str:
    return "".join(
        Plane(flat).poly(square(i, j, 1, 1), "grid") for i in range(w) for j in range(d)
    )


def port_mark(px: float, py: float, direction: Pt, name: str, clear: float) -> str:
    """Port disc on the face, and the name on a leader that ends ``clear`` px
    out along the face direction, past the symbol's silhouette."""
    m = math.hypot(*direction) or 1
    ux, uy = direction[0] / m, direction[1] / m
    lx, ly = px + ux * clear, py + uy * clear
    anchor = "start" if ux > 0.2 else "end" if ux < -0.2 else "middle"
    ty = ly + (3 if abs(uy) < 0.7 else (10 if uy > 0 else -4))
    tx = lx + (3 if ux > 0.2 else -3 if ux < -0.2 else 0)
    return (
        f'<line class="leader" x1="{px:.1f}" y1="{py:.1f}" x2="{lx:.1f}" y2="{ly:.1f}"/>'
        f'<circle class="port" cx="{px:.1f}" cy="{py:.1f}" r="3"/>'
        + text(tx, ty, name, "tag tm", anchor)
    )


def iso_symbol_drawing(sym: Symbol) -> str:
    w, d = sym.footprint
    cx, cy = project(w / 2, d / 2, 0)
    g = f'<g transform="translate({-cx:.1f} {-cy + 10:.1f})">' + footprint_iso(w, d)
    if sym.inline:
        g += pipe_iso([(-0.7, 0.5, AXIS), (w + 0.7, 0.5, AXIS)], sym.inline)
    g += sym.draw_iso()
    # A leader must clear the widest thing between the port and the label: the
    # symbol's own silhouette, which grows with footprint and height.
    clear = 18 + 10 * max(w, d) + 8 * sym.height
    for x, y, side, name in sym.ports:
        ox, oy = SIDE_OFFSET[side]
        px, py = project(x + 0.5 + ox, y + 0.5 + oy, AXIS)
        far = project(x + 0.5 + 2 * ox, y + 0.5 + 2 * oy, AXIS)
        g += port_mark(px, py, (far[0] - px, far[1] - py), name, clear)
    return g + "</g>"


def flat_symbol_drawing(sym: Symbol) -> str:
    w, d = sym.footprint
    g = (
        f'<g transform="translate({-w * FC / 2:.1f} {-d * FC / 2:.1f})">'
        + footprint_flat(w, d)
    )
    if sym.inline:
        g += pipe([flat(-0.7, 0.5), flat(w + 0.7, 0.5)], sym.inline)
    g += sym.draw_flat()
    if sym.label:
        lx, ly = flat(*sym.centre)
        g += text(
            lx, ly + (-2 if sym.label_on_face else -22), sym.label, "sym t", "middle"
        )
    for x, y, side, name in sym.ports:
        ox, oy = SIDE_OFFSET[side]
        px, py = flat(x + 0.5 + ox, y + 0.5 + oy)
        g += port_mark(px, py, (ox, oy), name, 18)
    return g + "</g>"


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


def card(ox: float, oy: float, w: float, h: float, sym: Symbol, draw: str) -> str:
    out = f'<rect class="chip" x="{ox}" y="{oy}" width="{w}" height="{h}" rx="6"/>'
    out += text(ox + 12, oy + 20, sym.title, "h t") + text(
        ox + 12, oy + 36, sym.sub, "note tm"
    )
    return (
        out
        + f'<g transform="translate({ox + w / 2:.1f} {oy + h / 2 + 24:.1f})">{draw}</g>'
    )


# ── sheets ───────────────────────────────────────────────────────────────────


def isometric_sheet(palettes: tuple[Palette, Palette]) -> str:
    width, height = 1040, 2010
    out = [text(24, 36, "Synoptic kit · isometric hydronic set", "title t")]
    out.append(
        text(
            24,
            56,
            "one cell = 80 × 40 px, z = 40 px · each symbol is its plan glyph projected and given height · ports marked on the face they leave through",
            "note tm",
        )
    )
    cw, ch, gap, cols = 324, 250, 12, 3
    for i, sym in enumerate(SYMBOLS):
        ox, oy = 24 + (i % cols) * (cw + gap), 76 + (i // cols) * (ch + gap)
        out.append(card(ox, oy, cw, ch, sym, iso_symbol_drawing(sym)))

    oy = 76 + 5 * (ch + gap)
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
    tank = SYMBOLS[1]
    g = (
        f'<g transform="translate({ox + 860} {oy + 50})">'
        + footprint_iso(1, 2)
        + extrude(circle_pts((0.5, 1), 0.45), 0, 1.6)
    )
    g += spath(
        [project(*q, 1.6) for q in circle_pts((0.5, 1), 0.45)], "fault", close=True
    )
    bx, by = project(1.1, 0.3, 1.6)
    g += f'<circle style="fill:hsl(var(--status-error))" cx="{bx:.1f}" cy="{by:.1f}" r="7"/>'
    g += f'<text class="tag" style="fill:hsl(var(--card))" x="{bx:.1f}" y="{by + 3.5:.1f}" text-anchor="middle">!</text>'
    out.append(g + "</g>")
    out.append(
        text(
            ox + 860,
            oy + 132,
            f"symbol · device faulty ({tank.title.lower()})",
            "note tm",
        )
    )

    oy += 160
    out.append(
        text(
            24,
            oy + 8,
            "Fluids · 45-55 % saturation, return = supply shifted 18 points of lightness",
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
    g += f'<circle style="fill:hsl(var(--fluid-primary-return))" cx="{tx:.1f}" cy="{ty:.1f}" r="3.5"/>'
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
    return sheet(width, height, "\n".join(out), palettes)


def filter_glyph(cx: float, cy: float) -> str:
    z = " ".join(
        f"{cx + (-5 if i % 2 == 0 else 5)},{cy + dy}"
        for i, dy in enumerate((-20, -13, -6, 1, 8, 15, 22))
    )
    return f'<rect class="face" x="{cx - 13}" y="{cy - 24}" width="26" height="48" rx="3"/><polyline class="detail" points="{z}"/>'


def coil_glyph(cx: float, cy: float, fluid: str) -> str:
    out = f'<rect class="face" x="{cx - 14}" y="{cy - 24}" width="28" height="48" rx="2" style="stroke:hsl(var(--{fluid}))"/>'
    for dx in (-7, 0, 7):
        out += f'<line x1="{cx + dx}" y1="{cy - 19}" x2="{cx + dx}" y2="{cy + 19}" style="stroke:hsl(var(--{fluid}));stroke-width:1.25"/>'
    return out


def damper_glyph(cx: float, cy: float) -> str:
    out = (
        f'<rect class="face" x="{cx - 8}" y="{cy - 24}" width="16" height="48" rx="2"/>'
    )
    for dy in (-14, 0, 14):
        out += f'<line class="detail" x1="{cx - 6}" y1="{cy + dy - 5}" x2="{cx + 6}" y2="{cy + dy + 5}"/>'
    return out


def duct_fan(cx: float, cy: float, *, spinning: bool) -> str:
    fill = "hsl(var(--hvac-fan))" if spinning else "hsl(var(--muted-foreground))"
    out = f'<circle class="face" cx="{cx}" cy="{cy}" r="22"/><g transform="translate({cx} {cy})" style="fill:{fill}">'
    for a in (0, 120, 240):
        out += f'<path transform="rotate({a})" d="M0 -4 C7 -7 8 -17 0 -20 C-8 -17 -7 -7 0 -4 Z"/>'
    return out + f'</g><circle class="fill" cx="{cx}" cy="{cy}" r="3"/>'


def flat_sheet(palettes: tuple[Palette, Palette]) -> str:
    width, height = 1040, 1250
    out = [text(24, 36, "Synoptic kit · flat set", "title t")]
    out.append(
        text(
            24,
            56,
            "one cell = 48 px · the plan glyphs the isometric set projects · the shipped AHU glyphs restyled below",
            "note tm",
        )
    )
    cw, ch, gap = 240, 200, 12
    for i, sym in enumerate(SYMBOLS):
        ox, oy = 24 + (i % 4) * (cw + gap), 76 + (i // 4) * (ch + gap)
        out.append(card(ox, oy, cw, ch, sym, flat_symbol_drawing(sym)))

    oy = 76 + 4 * (ch + gap)
    out.append(
        text(
            24,
            oy + 8,
            "Distribution view · AHU duct glyphs in the same language (fan, filter, coils, damper, chip)",
            "caption tm",
        )
    )
    g = f'<g transform="translate(60 {oy + 80})"><rect class="duct" x="0" y="-26" width="900" height="52" rx="3"/>'
    g += damper_glyph(40, 0) + filter_glyph(120, 0) + duct_fan(220, 0, spinning=True)
    g += coil_glyph(330, 0, "fluid-heating-supply") + coil_glyph(
        400, 0, "fluid-chilled-supply"
    )
    g += duct_fan(520, 0, spinning=False)
    for x in (640, 760, 870):
        g += f'<path class="detail" d="M {x - 6} -8 L {x + 6} 0 L {x - 6} 8"/>'
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
    return sheet(width, height, "\n".join(out), palettes)


def departures(ox: float, oy: float, *, alternate: bool) -> str:
    n, length = 8, 10
    g = f'<g transform="translate({ox} {oy})">' + footprint_iso(length, 1)
    g += pipe_iso([(-2, 0.5, AXIS), (0, 0.5, AXIS)], "fluid-primary-supply", flow=True)
    g += cylinder_x(0, length, 0.5, AXIS, 0.2)
    axis = iso_plane(AXIS)
    for i in range(n):
        x = i + 1
        g += pipe_iso(
            [(x + 0.5, 1, AXIS), (x + 0.5, 4.6, AXIS)],
            "fluid-primary-supply",
            flow=i % 3 != 1,
        )
        g += axis.poly(circle_pts((x + 0.5, 1.5), 0.3), "face") + valve_glyph(
            axis, (x + 0.5, 1.5), (0, 1)
        )
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
    px, py = project(0, 0.5, AXIS)
    return g + port_mark(px, py, (-1, -0.5), "in_1", 30) + "</g>"


def density_sheet(palettes: tuple[Palette, Palette]) -> str:
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
    return sheet(width, height, "\n".join(out), palettes)


if __name__ == "__main__":
    palettes = read_tokens()
    check_palette(palettes[0], "light")
    check_palette(palettes[1], "dark")
    (OUT / "isometric.svg").write_text(isometric_sheet(palettes))
    (OUT / "flat.svg").write_text(flat_sheet(palettes))
    (OUT / "density-collector-8.svg").write_text(density_sheet(palettes))
