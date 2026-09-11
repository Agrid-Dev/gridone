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
import json
import math
import re
from collections.abc import Callable, Iterable, Sequence
from pathlib import Path
from typing import Any

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
# Faces: lightness points between the plate and the top face and
# between adjacent faces, and CIE76 between the detail stroke and any face.
FACE_STEP = 4
DETAIL_DELTA_E = 25
FACES = ["synoptic-plate", "synoptic-body", "synoptic-body-x", "synoptic-body-y"]

TOKENS = [
    "synoptic-plate",
    "synoptic-grid",
    "synoptic-body",
    "synoptic-body-x",
    "synoptic-body-y",
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


def lightness(triplet: str) -> float:
    return float(triplet.split()[2].rstrip("%"))


def check_faces(values: Palette, theme: str) -> None:
    """Refuse faces that do not step apart, or that the detail stroke sinks into."""
    failures = []
    for a, b in itertools.pairwise(FACES):
        step = abs(lightness(values[a]) - lightness(values[b]))
        if step < FACE_STEP:
            failures.append(f"{a} vs {b}: {step:.0f} points < {FACE_STEP}")
    for face in FACES[1:]:
        d = delta_e(values["muted-foreground"], values[face])
        if d < DETAIL_DELTA_E:
            failures.append(f"muted-foreground vs {face}: {d:.1f} < {DETAIL_DELTA_E}")
    if failures:
        msg = f"{theme} faces too close:\n  " + "\n  ".join(failures)
        raise ValueError(msg)


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
# leader 1. The body fill on faces occludes what sits behind a symbol.
RULES: list[tuple[tuple[str, ...], str]] = [
    (("plate",), "fill:hsl(var(--synoptic-plate))"),
    (("grid",), "stroke:hsl(var(--synoptic-grid));stroke-width:1;fill:none"),
    (
        ("face", "outline", "detail", "duct"),
        "stroke:hsl(var(--synoptic-stroke));stroke-linejoin:round;stroke-linecap:round",
    ),
    (("face", "outline"), "stroke-width:2"),
    (("face",), "fill:hsl(var(--synoptic-body))"),
    (("side",), "stroke:none"),
    (("side-x",), "fill:hsl(var(--synoptic-body-x))"),
    (("side-y",), "fill:hsl(var(--synoptic-body-y))"),
    (("outline", "detail"), "fill:none"),
    (("detail",), "stroke:hsl(var(--muted-foreground));stroke-width:1.25"),
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
    (("tag",), "font-size:11px;font-weight:600;letter-spacing:.06em"),
    (("val",), "font-size:12px;font-weight:600"),
    (("unit",), "font-size:11px;font-weight:500"),
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
        kept = [c for c in classes if all(part in used for part in c.split())]
        if kept:
            selectors = ",".join("." + c.replace(" ", " .") for c in kept)
            rules.append(selectors + "{" + decl + "}")
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


def valve_glyph(
    p: Plane, c: Pt, d: Pt = (1, 0), *, tee: bool = False, closed: bool = False
) -> str:
    """ISA bowtie across the run, solid when closed. The third port of a
    mixing valve is on +y."""
    r = 0.26
    out = p.poly(
        rot([(-r, -r * 0.7), (-r, r * 0.7), (r, -r * 0.7), (r, r * 0.7)], c, d),
        "outline fill" if closed else "outline",
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


def silhouette(outline: list[Pt], z0: float, z1: float) -> list[Pt]:
    """Outer boundary of an extruded outline on screen: the visible arc at the
    base, then the hidden arc at the top, so a fault outline wraps the whole
    body and not only its lid."""
    idx = visible_arc(outline, z1)
    n = len(outline)
    step = 1 if len(idx) < 2 or (idx[1] - idx[0]) % n == 1 else -1
    hidden = [(idx[-1] + k * step) % n for k in range(1, n - len(idx) + 1)]
    return [project(*outline[i], z0) for i in idx] + [
        project(*outline[i], z1) for i in [idx[-1], *hidden, idx[0]]
    ]


def extrude(outline: list[Pt], z0: float, z1: float) -> str:
    """A plan outline given height: the visible side split into the faces that
    look along ``x`` and along ``y`` (``side-x`` / ``side-y``) so the kit
    can tone them apart, then the side band outline and the top face. Hidden
    edges are not drawn."""
    idx = visible_arc(outline, z1)
    n = len(outline)
    cx = sum(p[0] for p in outline) / n
    cy = sum(p[1] for p in outline) / n

    def facing(a: int, b: int) -> str:
        (ax, ay), (bx, by) = outline[a], outline[b]
        mx, my = (ax + bx) / 2 - cx, (ay + by) / 2 - cy
        return "side side-x" if abs(mx) >= abs(my) else "side side-y"

    out = ""
    runs: list[tuple[str, list[int]]] = []
    for a, b in itertools.pairwise(idx):
        cls = facing(a, b)
        if runs and runs[-1][0] == cls:
            runs[-1][1].append(b)
        else:
            runs.append((cls, [a, b]))
    for cls, pts in runs:
        face = [project(*outline[i], z0) for i in pts] + [
            project(*outline[i], z1) for i in reversed(pts)
        ]
        out += spath(face, cls, close=True)
    band = [project(*outline[i], z0) for i in idx] + [
        project(*outline[i], z1) for i in reversed(idx)
    ]
    out += spath(band, "outline", close=True)
    return out + spath([project(*q, z1) for q in outline], "face", close=True)


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
        type_: str,
        note: str,
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
        self.title, self.type, self.note = title, type_, note
        self.footprint, self.plan = footprint, plan
        self.ports, self.inline, self.base, self.height = ports, inline, base, height
        self.outline, self.label, self.label_on_face = outline, label, label_on_face

    @property
    def sub(self) -> str:
        return f"{self.type} · {self.note}"

    @property
    def centre(self) -> Pt:
        return (self.footprint[0] / 2, self.footprint[1] / 2)

    def label_anchor(self) -> Pt:
        """Baseline centre of the label above the symbol, origin at (0, 0)."""
        lx, ly = project(*self.centre, self.base + self.height)
        return (lx, ly - 26 - (14 if self.height else 0))

    def draw_flat(self) -> str:
        return self.plan(Plane(flat), self.centre)

    def draw_iso(self, origin: Pt = (0, 0), label: str | None = None) -> str:
        """The symbol with its origin cell at ``origin``; the projection is
        linear, so the offset is a screen translation. ``label`` replaces the
        sheet label for a placed instance."""
        label = label or self.label
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
        if label:
            lx, ly = project(*self.centre, top)
            if self.label_on_face:
                lines = label.replace(" ", "\n")
                out += text(
                    lx + 8, ly + 4 - 6 * lines.count("\n"), lines, "sym t", "middle"
                )
            else:
                out += text(*self.label_anchor(), label, "sym t", "middle")
        if origin == (0, 0):
            return out
        dx, dy = project(*origin)
        return f'<g transform="translate({dx:.1f} {dy:.1f})">{out}</g>'


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
        "heat_pump",
        "2×2",
        (2, 2),
        heat_pump_plan,
        ports=[(1, 1, "+x", "supply"), (0, 1, "-x", "return")],
        height=1.1,
        outline=lambda c: square(c[0] - 1, c[1] - 1, 2, 2),
    ),
    Symbol(
        "Ballon",
        "tank",
        "1×2",
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
        "collector",
        "no footprint, length and ports authored",
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
        "mixing_valve",
        "1×1",
        (1, 1),
        lambda p, c: valve_glyph(p, c, tee=True),
        ports=[(0, 0, "-x", "hot_in"), (0, 0, "+y", "cold_in"), (0, 0, "+x", "out")],
        base=AXIS,
        label="M",
    ),
    Symbol(
        "Pompe simple",
        "pump",
        "inline",
        (1, 1),
        pump_glyph,
        inline="fluid-primary-supply",
        base=AXIS,
    ),
    Symbol(
        "Vanne d'isolement",
        "valve_isolation",
        "inline",
        (1, 1),
        valve_glyph,
        inline="fluid-primary-supply",
        base=AXIS,
    ),
    Symbol(
        "Clapet",
        "valve_check",
        "inline",
        (1, 1),
        lambda p, c: valve_glyph(p, c) + p.dot((c[0] + 0.1, c[1]), 0.07),
        inline="fluid-primary-supply",
        base=AXIS,
    ),
    Symbol(
        "Renvoi de folio",
        "link",
        "1×2",
        (1, 2),
        link_glyph,
        ports=[(0, 0, "-x", "in"), (0, 1, "-x", "out")],
        base=AXIS,
        label="ECS\nOUEST",
        label_on_face=True,
    ),
    Symbol(
        "Échangeur à plaques",
        "plate_exchanger",
        "1×1 proposed, not registered",
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
        "air_separator",
        "inline proposed, not registered",
        (1, 1),
        air_separator_glyph,
        inline="fluid-heating-supply",
        base=AXIS,
    ),
    Symbol(
        "Vase d'expansion",
        "expansion_vessel",
        "1×1 proposed, not registered",
        (1, 1),
        expansion_vessel_glyph,
        ports=[(0, 0, "-x", "in")],
        height=0.8,
        outline=capsule_pts,
    ),
    Symbol(
        "Pot à boue",
        "dirt_separator",
        "inline proposed, not registered",
        (1, 1),
        dirt_separator_glyph,
        inline="fluid-heating-return",
        base=AXIS,
    ),
    Symbol(
        "Pompe double",
        "pump_double",
        "inline proposed, not registered",
        (1, 1),
        pump_double_plan,
        inline="fluid-heating-supply",
        base=AXIS,
    ),
    Symbol(
        "Compteur d'énergie",
        "energy_meter",
        "inline proposed, not registered",
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


def chip_width(value: str, unit: str) -> float:
    return max(44, 7.2 * len(value) + 7.0 * len(unit) + 18)


def chip(
    cx: float, cy: float, label: str, value: str, unit: str = "", state: str = "ok"
) -> str:
    """Value chip, 22 px tall: value and unit inside, label above."""
    w = chip_width(value, unit)
    cls = {"ok": "chip", "stale": "chip-stale", "fault": "chip-fault"}[state]
    tcls = "tm" if state == "stale" else "t"
    out = f'<rect class="{cls}" x="{cx - w / 2:.1f}" y="{cy - 11:.1f}" width="{w:.1f}" height="22" rx="4"/>'
    vx = cx - (7.0 * len(unit) + 3) / 2 if unit else cx
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
    at = project(cell[0] + 0.5, cell[1] + 0.5, cell[2] + AXIS)
    return tag(at, fluid, label, value, unit, state, side)


def tag(
    at: Pt,
    fluid: str,
    label: str,
    value: str,
    unit: str = "",
    state: str = "ok",
    side: str = "above",
) -> str:
    """A tag riding on a run: leader from the chip to the pipe, dot on the pipe."""
    px, py = at
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
PANEL_W = 164
ON_STATES = {"MARCHE", "OUVERTE"}


def led(x: float, y: float, *, on: bool, faulty: bool) -> str:
    """Run-state LED: error when the device is faulty, ok when on, muted when off."""
    colour = "status-error" if faulty else "status-ok" if on else "muted-foreground"
    return (
        f'<circle style="fill:hsl(var(--{colour}))" cx="{x:.1f}" cy="{y:.1f}" r="4"/>'
    )


def panel_height(rows: int) -> int:
    return 30 + 20 * rows + 8


def panel(
    x: float,
    y: float,
    title: str,
    rows: list[Row],
    *,
    on: bool = True,
    faulty: bool = False,
) -> str:
    """Equipment panel: title and LED, a rule, then one row per bound slot
    (ÉTAT and DÉFAUT are rows like the others; a fault value is in the error
    colour)."""
    w, rh = PANEL_W, 20
    h = panel_height(len(rows))
    out = f'<rect class="{"chip-fault" if faulty else "chip"}" x="{x}" y="{y}" width="{w}" height="{h}" rx="4"/>'
    out += text(x + 10, y + 16, title, "sym t")
    out += led(x + w - 12, y + 11, on=on, faulty=faulty)
    out += f'<line class="leader" x1="{x + 8}" y1="{y + 24}" x2="{x + w - 8}" y2="{y + 24}"/>'
    for i, (label, value, unit, row_state) in enumerate(rows):
        yy = y + 30 + rh * i + 13
        stale = row_state == "stale"
        out += text(x + 10, yy, label, "tag tm")
        vx = x + w - 10 - 7.0 * len(unit) - 4 if unit else x + w - 10
        vcls = {"stale": "val tm", "fault": "val te"}.get(row_state, "val t")
        out += text(vx, yy, value, vcls, "end")
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
    width, height = 1040, 2034
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
            [
                ("ÉTAT", "MARCHE", "", "ok"),
                ("DÉFAUT", "NORMAL", "", "ok"),
                ("DÉPART", "52,4", "°C", "ok"),
                ("PUISSANCE", "38,2", "kW", "ok"),
            ],
        )
    )
    out.append(text(ox, oy + 156, "panel · live", "note tm"))
    out.append(
        panel(
            ox + 180,
            oy + 20,
            "PAC 04",
            [
                ("ÉTAT", "MARCHE", "", "ok"),
                ("DÉFAUT", "NORMAL", "", "ok"),
                ("DÉPART", "51,9", "°C", "stale"),
                ("PUISSANCE", "36,0", "kW", "ok"),
            ],
        )
    )
    out.append(text(ox + 180, oy + 156, "panel · one row stale", "note tm"))
    out.append(
        panel(
            ox + 360,
            oy + 20,
            "PAC 03",
            [
                ("ÉTAT", "ARRÊT", "", "ok"),
                ("DÉFAUT", "DÉFAUT", "", "fault"),
                ("DÉPART", "31,0", "°C", "ok"),
                ("PUISSANCE", "0,0", "kW", "ok"),
            ],
            on=False,
            faulty=True,
        )
    )
    out.append(text(ox + 360, oy + 156, "panel · device faulty", "note tm"))
    g = f'<g transform="translate({ox + 530} {oy + 40})">'
    g += pipe_iso([(0, 0, AXIS), (5, 0, AXIS)], "fluid-dhw", flow=True)
    g += tag_iso((0, -1, 0.0), "fluid-dhw", "TT-05", "55,1", "°C", "ok")
    g += tag_iso((2, -1, 0.0), "fluid-dhw", "TT-06", "49,8", "°C", "stale")
    g += tag_iso((4, -1, 0.0), "fluid-dhw", "FT-01", "2,4", "m³/h", "fault")
    out.append(g + "</g>")
    out.append(
        text(
            ox + 530,
            oy + 156,
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
    g += spath(silhouette(circle_pts((0.5, 1), 0.45), 0, 1.6), "fault", close=True)
    bx, by = project(1.1, 0.3, 1.6)
    g += f'<circle style="fill:hsl(var(--status-error))" cx="{bx:.1f}" cy="{by:.1f}" r="7"/>'
    g += f'<text class="tag" style="fill:hsl(var(--card))" x="{bx:.1f}" y="{by + 3.5:.1f}" text-anchor="middle">!</text>'
    out.append(g + "</g>")
    out.append(
        text(
            ox + 860,
            oy + 156,
            f"symbol · device faulty ({tank.title.lower()})",
            "note tm",
        )
    )

    oy += 184
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


# ── plate: the ECS Est plate drawn from its document ─────────────────────────

DOCUMENT = OUT.parent / "ecs-est.json"
BY_TYPE = {sym.type: sym for sym in SYMBOLS}
# App content area on a 1440 x 900 laptop at 100 %: 256 px sidebar, 64 px top bar.
FRAME_W, FRAME_H = 1184, 836
ROLE_CLASS = {"title": "title t", "caption": "caption tm", "note": "note tm"}
SLOT_ROWS = {
    "supply_temp": ("DÉPART", "°C"),
    "power": ("PUISSANCE", "kW"),
    "temperature": ("TEMPÉRATURE", "°C"),
}
# What the plate's bindings would read on the sheet.
LIVE_SLOTS: dict[str, dict[str, str]] = {
    "pac-03": {
        "state": "MARCHE",
        "fault": "NORMAL",
        "supply_temp": "52,4",
        "power": "38,2",
    },
    "pac-04": {
        "state": "ARRÊT",
        "fault": "DÉFAUT",
        "supply_temp": "31,0",
        "power": "0,0",
    },
    "b01": {"temperature": "56"},
    "b04": {"temperature": "54"},
    "b07": {"temperature": "49"},
    "mitigeur": {"supply_temp": "55,0"},
    "v-03": {"state": "OUVERTE"},
    "v-04": {"state": "FERMÉE"},
    "p-bcl": {"state": "MARCHE"},
}
LIVE_TAGS = {
    "tt-03": "52,4",
    "tt-04": "31,0",
    "tt-05": "55,1",
    "tt-06": "49,8",
    "ft-01": "2,4",
}
FAULTY = {"pac-04"}
STALE = {"tt-04", "pac-04.supply_temp"}
FLOWING = {
    "pac-03-supply",
    "feed-col-1",
    "feed-col-2",
    "feed-col-3",
    "feed-ecs-ouest",
    "dhw-loop-return",
    "dhw-loop-to-storage",
}

Doc = dict[str, Any]


def fluid_class(fluid: str) -> str:
    return "fluid-" + fluid.replace("_", "-")


def origin_of(sym: Doc) -> Pt:
    c = sym["placement"]["cell"]
    return (c["x"], c["y"])


def port_cell(sym: Doc, port: str) -> Pt:
    """The port's cell: registry offset, or the authored offset along a
    collector's axis."""
    ox, oy = origin_of(sym)
    if sym["type"] == "collector":
        off = sym["props"]["ports"][port]["offset"]
        dx, dy = (0, off) if sym["props"]["axis"] == "y" else (off, 0)
    else:
        dx, dy = next(
            (px, py) for px, py, _, name in BY_TYPE[sym["type"]].ports if name == port
        )
    return (ox + dx, oy + dy)


def endpoint_cell(symbols: dict[str, Doc], end: Doc) -> Pt3:
    if end["kind"] == "port":
        x, y = port_cell(symbols[end["symbol"]], end["port"])
        return (x, y, 0)
    c = end["cell"]
    return (c["x"], c["y"], c.get("z", 0))


def polyline(symbols: dict[str, Doc], pipe: Doc) -> list[Pt3]:
    """From-cell, waypoints, to-cell (the format's Pipes section)."""
    cells = [endpoint_cell(symbols, pipe["from"])]
    cells += [(w["x"], w["y"], w.get("z", 0)) for w in pipe["waypoints"]]
    return [*cells, endpoint_cell(symbols, pipe["to"])]


def run_direction(cells: list[Pt3], cell: Pt) -> Pt:
    """Direction of the axis-aligned segment through ``cell``."""
    for (ax, ay, _), (bx, by, _) in itertools.pairwise(cells):
        if min(ax, bx) <= cell[0] <= max(ax, bx) and min(ay, by) <= cell[1] <= max(
            ay, by
        ):
            return ((bx > ax) - (bx < ax), (by > ay) - (by < ay))
    msg = f"{cell} is not on the run"
    raise ValueError(msg)


Box = tuple[float, float, float, float]


class View:
    """How a plate reaches the screen: the isometric projection with height,
    or the flat plan where height is ignored (the format's ``projection``)."""

    def __init__(self, *, iso: bool, window: Pt) -> None:
        self.iso = iso
        # Screen point of the grid corner the frame shows at its top-left.
        self.window = window

    def pt(self, x: float, y: float, z: float = 0.0) -> Pt:
        return project(x, y, z) if self.iso else flat(x, y)

    def plane(self, z: float) -> Plane:
        return iso_plane(z) if self.iso else Plane(flat)

    def top(self, kind: Symbol) -> float:
        return kind.base + kind.height if self.iso else 0.0

    def body(self, kind: Symbol, origin: Pt) -> list[Pt]:
        """Screen polygon of the body: the extruded silhouette, or the plan outline."""
        ox, oy = origin
        local = (
            kind.outline(kind.centre) if kind.outline else square(0, 0, *kind.footprint)
        )
        body = [(x + ox, y + oy) for x, y in local]
        if self.iso and kind.height:
            return silhouette(body, kind.base, self.top(kind))
        return [self.pt(x, y, self.top(kind)) for x, y in body]

    def label_anchor(self, kind: Symbol, origin: Pt) -> Pt:
        if self.iso:
            dx, dy = project(*origin)
            lx, ly = kind.label_anchor()
            return (lx + dx, ly + dy)
        fx, fy = flat(origin[0] + kind.centre[0], origin[1] + kind.centre[1])
        return (fx, fy - kind.footprint[1] * FC / 2 - 10)

    def anchors(self, kind: Symbol, origin: Pt) -> tuple[Pt, Pt, Pt]:
        """Left, right and bottom points of the body a panel leads to."""
        ox, oy = origin
        w, d = kind.footprint
        if self.iso:
            top = self.top(kind)
            return (
                project(ox, oy + d, top),
                project(ox + w, oy, top),
                project(ox + w, oy + d, kind.base),
            )
        return flat(ox, oy + d / 2), flat(ox + w, oy + d / 2), flat(ox + w / 2, oy + d)

    def visible(self, box: Box, margin: float = 8) -> bool:
        """Whether a box lies inside the frame this view is shown through."""
        x0, y0 = self.window[0] - 24, self.window[1] - 16
        return (
            box[0] >= x0 + margin
            and box[1] >= y0 + margin
            and box[2] <= x0 + FRAME_W - margin
            and box[3] <= y0 + FRAME_H - margin
        )

    def behind(self, x: int, y: int) -> set[Pt]:
        """Cells a chip rising screen-up from ``(x, y)`` would cover."""
        if self.iso:
            return {(x - 1, y - 1), (x - 1, y), (x, y - 1)}
        return {(x, y - 1)}

    def draw(self, kind: Symbol, origin: Pt, label: str | None) -> str:
        if self.iso:
            return kind.draw_iso(origin, label)
        dx, dy = flat(*origin)
        # The footprint takes the plate colour so the glyph occludes the runs
        # ending at its ports, as an extruded body does.
        footprint = Plane(flat).poly(square(0, 0, *kind.footprint), "face")
        out = f'<g transform="translate({dx:.1f} {dy:.1f})">{footprint}{kind.draw_flat()}</g>'
        if not label:
            return out
        if kind.label_on_face:
            cx, cy = flat(origin[0] + kind.centre[0], origin[1] + kind.centre[1])
            lines = label.replace(" ", "\n")
            return out + text(
                cx, cy + 4 - 6 * lines.count("\n"), lines, "sym t", "middle"
            )
        return out + text(*self.label_anchor(kind, origin), label, "sym t", "middle")


ISO_VIEW = View(iso=True, window=(-14.5 * SX, -9.5 * SY))


def inline_glyph(
    view: View, sym: Symbol, cell: Pt, d: Pt, label: str | None, state: str | None
) -> str:
    """Inline glyph oriented by its run, body-filled so it breaks the run; a
    valve shows its state on the glyph, a pump beside its label."""
    plane = view.plane(AXIS)
    c = (cell[0] + 0.5, cell[1] + 0.5)
    if sym.type == "pump":
        glyph = pump_glyph(plane, c, d)
    elif sym.type == "valve_isolation":
        glyph = valve_glyph(
            plane, c, d, closed=state is not None and state not in ON_STATES
        )
    else:
        glyph = sym.plan(plane, c)
    out = plane.poly(circle_pts(c, 0.3), "face") + glyph
    if label:
        lx, ly = view.pt(*c, AXIS)
        out += text(lx, ly + 22, label, "tag tm", "middle")
        if sym.type == "pump" and state is not None:
            out += led(
                lx + 4 * len(label) + 10, ly + 18, on=state in ON_STATES, faulty=False
            )
    return out


def collector_bar(sym: Doc) -> list[Pt]:
    """Bar on the axis plane, authored length along the authored axis."""
    x, y = origin_of(sym)
    props = sym["props"]
    if props["axis"] == "y":
        return square(x + 0.3, y, 0.4, props["length"])
    return square(x, y + 0.3, props["length"], 0.4)


def collector_glyph(view: View, sym: Doc) -> str:
    x, y = origin_of(sym)
    lx, ly = view.pt(x + 0.5, y + 0.5, AXIS)
    return view.plane(AXIS).poly(collector_bar(sym), "face") + text(
        lx, ly - 14, sym["label"], "sym t", "middle"
    )


def fault_glyph(view: View, kind: Symbol, origin: Pt) -> str:
    """Error outline around the whole body, badge at the top-right of the footprint."""
    ox, oy = origin
    out = spath(view.body(kind, origin), "fault", close=True)
    bx, by = view.pt(ox + kind.footprint[0] + 0.1, oy + 0.2, view.top(kind))
    out += f'<circle style="fill:hsl(var(--status-error))" cx="{bx:.1f}" cy="{by:.1f}" r="7"/>'
    return out + (
        f'<text class="tag" style="fill:hsl(var(--card))" x="{bx:.1f}" y="{by + 3.5:.1f}" '
        'text-anchor="middle">!</text>'
    )


def panel_rows(sym: Doc, live: dict[str, str]) -> list[Row]:
    rows: list[Row] = []
    for slot in sym["bindings"]:
        if slot == "state":
            rows.append(("ÉTAT", live[slot], "", "ok"))
        elif slot == "fault":
            rows.append(
                ("DÉFAUT", live[slot], "", "fault" if sym["id"] in FAULTY else "ok")
            )
        elif slot in SLOT_ROWS:
            state = "stale" if f"{sym['id']}.{slot}" in STALE else "ok"
            rows.append((SLOT_ROWS[slot][0], live[slot], SLOT_ROWS[slot][1], state))
    return rows


def bounds(points: list[Pt]) -> Box:
    xs, ys = [x for x, _ in points], [y for _, y in points]
    return (min(xs), min(ys), max(xs), max(ys))


def overlaps(a: Box, b: Box, margin: float = 4) -> bool:
    return (
        a[0] < b[2] + margin
        and b[0] < a[2] + margin
        and a[1] < b[3] + margin
        and b[1] < a[3] + margin
    )


def panel_place(
    view: View, kind: Symbol, origin: Pt, h: float, obstacles: list[Box]
) -> tuple[Box, Pt]:
    """Panel box and the point its leader ends at: above the label, else left
    of the body, else right, else below, the first spot inside the frame and
    clear of every obstacle."""
    lx, ly = view.label_anchor(kind, origin)
    left, right, below = view.anchors(kind, origin)
    candidates = [
        ((lx - PANEL_W / 2, ly - 8 - h), (lx, ly - 4)),
        ((left[0] - 20 - PANEL_W, left[1] - h / 2), left),
        ((right[0] + 20, right[1] - h / 2), right),
        ((below[0] - PANEL_W / 2, below[1] + 20), below),
    ]
    for (px, py), anchor in candidates:
        box = (px, py, px + PANEL_W, py + h)
        if view.visible(box) and not any(overlaps(box, o) for o in obstacles):
            return box, anchor
    box, anchor = candidates[0]
    return (box[0], box[1], box[0] + PANEL_W, box[1] + h), anchor


def readings(
    view: View, sym: Doc, kind: Symbol, origin: Pt, obstacles: list[Box]
) -> str:
    """What the symbol's bindings show: an LED after the label when it has a
    state, a chip under the label for a single reading, a panel for more,
    placed clear of the bodies and panels in ``obstacles`` and joined to the
    symbol by a leader."""
    live = LIVE_SLOTS.get(sym["id"])
    if live is None:
        return ""
    lx, ly = view.label_anchor(kind, origin)
    faulty = sym["id"] in FAULTY
    out = ""
    if "state" in live:
        out += led(
            lx + 4 * len(sym["label"]) + 10,
            ly - 4,
            on=live["state"] in ON_STATES,
            faulty=faulty,
        )
    rows = panel_rows(sym, live)
    if len(rows) == 1:
        _, value, unit, state = rows[0]
        return out + chip(lx, ly + 16, "", value, unit, state)
    h = panel_height(len(rows))
    box, (ax, ay) = panel_place(view, kind, origin, h, obstacles)
    obstacles.append(box)
    px, py = box[0], box[1]
    ex, ey = min(max(ax, px), px + PANEL_W), min(max(ay, py), py + h)
    out += f'<line class="leader" x1="{ex:.1f}" y1="{ey:.1f}" x2="{ax:.1f}" y2="{ay:.1f}"/>'
    return out + panel(
        px, py, sym["label"], rows, on=live.get("state") in ON_STATES, faulty=faulty
    )


def symbol_glyph(
    view: View, sym: Doc, symbols: dict[str, Doc], pipes: dict[str, Doc]
) -> str:
    kind = BY_TYPE[sym["type"]]
    placement = sym["placement"]
    live = LIVE_SLOTS.get(sym["id"], {})
    if placement["kind"] == "pipe":
        cell = (placement["cell"]["x"], placement["cell"]["y"])
        d = run_direction(polyline(symbols, pipes[placement["pipe"]]), cell)
        return inline_glyph(view, kind, cell, d, sym["label"], live.get("state"))
    if sym["type"] == "collector":
        return collector_glyph(view, sym)
    origin = origin_of(sym)
    out = view.draw(kind, origin, sym["label"])
    if sym["id"] in FAULTY:
        out += fault_glyph(view, kind, origin)
    return out


def plate(doc: Doc, view: View) -> str:
    """The document drawn in the kit: runs, then symbols back to front, then
    tags, readings and labels."""
    symbols = {sym["id"]: sym for sym in doc["symbols"]}
    pipes = {pipe["id"]: pipe for pipe in doc["pipes"]}
    g = ""
    for pipe_ in doc["pipes"]:
        points = [
            view.pt(x + 0.5, y + 0.5, z + AXIS) for x, y, z in polyline(symbols, pipe_)
        ]
        g += pipe(points, fluid_class(pipe_["fluid"]), flow=pipe_["id"] in FLOWING)
    ordered = sorted(doc["symbols"], key=lambda sym: sum(origin_of(sym)))
    for sym in ordered:
        g += symbol_glyph(view, sym, symbols, pipes)
    placed = [sym for sym in ordered if sym["placement"]["kind"] == "cell"]
    bodies = {
        (x + dx, y + dy)
        for sym in placed
        if BY_TYPE[sym["type"]].height
        for x, y in [origin_of(sym)]
        for dx in range(BY_TYPE[sym["type"]].footprint[0])
        for dy in range(BY_TYPE[sym["type"]].footprint[1])
    }
    obstacles = [
        bounds(
            [view.pt(x, y, AXIS) for x, y in collector_bar(sym)]
            if sym["type"] == "collector"
            else view.body(BY_TYPE[sym["type"]], origin_of(sym))
        )
        for sym in placed
    ]
    for sym in ordered:
        if sym["placement"]["kind"] == "pipe":
            cx, cy = sym["placement"]["cell"]["x"], sym["placement"]["cell"]["y"]
            obstacles.append(
                bounds(
                    [view.pt(cx + dx, cy + dy, AXIS) for dx in (0, 1) for dy in (0, 1)]
                )
            )
    for pipe_ in doc["pipes"]:
        for tag_ in pipe_["tags"]:
            x, y, z = tag_["at"]["x"], tag_["at"]["y"], tag_["at"].get("z", 0)
            # A chip rises screen-up, over the cells behind the run: when a
            # body stands there the chip hangs below instead (Decision 15).
            side = "below" if view.behind(x, y) & bodies else "above"
            at = view.pt(x + 0.5, y + 0.5, z + AXIS)
            value, unit = LIVE_TAGS[tag_["id"]], tag_["value"]["unit"]
            g += tag(
                at,
                fluid_class(pipe_["fluid"]),
                tag_["label"],
                value,
                unit,
                "stale" if tag_["id"] in STALE else "ok",
                side,
            )
            half = chip_width(value, unit) / 2
            top = at[1] - 70 if side == "above" else at[1] + 41
            obstacles.append((at[0] - half, top, at[0] + half, top + 37))
    for sym in placed:
        if sym["type"] != "collector":
            g += readings(view, sym, BY_TYPE[sym["type"]], origin_of(sym), obstacles)
    for label in doc["labels"]:
        lx, ly = view.pt(label["at"]["x"], label["at"]["y"])
        g += text(lx, ly, label["text"], ROLE_CLASS[label["role"]])
    return g


# Room around the plate's cells for panels, chips and labels.
PAD_LEFT, PAD_TOP, PAD_RIGHT, PAD_BOTTOM = 230, 150, 60, 40


def plate_bounds(doc: Doc, view: View) -> Box:
    """Screen bounds of everything the document places, padded for what the
    kit hangs on it."""
    points: list[Pt] = []
    for sym in doc["symbols"]:
        if sym["placement"]["kind"] != "cell":
            continue
        kind = BY_TYPE[sym["type"]]
        x, y = origin_of(sym)
        w, d = kind.footprint
        if sym["type"] == "collector":
            length = sym["props"]["length"]
            w, d = (1, length) if sym["props"]["axis"] == "y" else (length, 1)
        for cx, cy in square(x, y, w, d):
            points += [view.pt(cx, cy), view.pt(cx, cy, view.top(kind))]
    symbols = {sym["id"]: sym for sym in doc["symbols"]}
    for pipe_ in doc["pipes"]:
        points += [view.pt(x, y, z) for x, y, z in polyline(symbols, pipe_)]
        points += [view.pt(t["at"]["x"], t["at"]["y"]) for t in pipe_["tags"]]
    points += [view.pt(lb["at"]["x"], lb["at"]["y"]) for lb in doc["labels"]]
    x0, y0, x1, y1 = bounds(points)
    return (x0 - PAD_LEFT, y0 - PAD_TOP, x1 + PAD_RIGHT, y1 + PAD_BOTTOM)


def frame(ox: float, oy: float, drawing: str, box: Box, view: View) -> str:
    """The whole plate at true size, the app content area marked on it as a
    dashed rectangle."""
    tx, ty = ox - box[0], oy - box[1]
    w, h = box[2] - box[0], box[3] - box[1]
    lx, ly = view.window[0] - 24 + tx, view.window[1] - 16 + ty
    laptop = (
        f'<rect style="fill:none;stroke:hsl(var(--muted-foreground));stroke-dasharray:6 4" '
        f'x="{lx:.1f}" y="{ly:.1f}" width="{FRAME_W}" height="{FRAME_H}"/>'
        + text(
            lx + 8,
            ly + FRAME_H - 8,
            "laptop content area · 1184 × 836 at 100 %",
            "note tm",
        )
    )
    return (
        f'<rect class="grid" x="{ox}" y="{oy}" width="{w:.0f}" height="{h:.0f}"/>'
        f'<g transform="translate({tx:.1f} {ty:.1f})">{drawing}</g>{laptop}'
    )


def plate_sheet(palettes: tuple[Palette, Palette]) -> str:
    """The ECS Est plate drawn whole in the kit: the reference for what run
    state, readings, panels, fault and stale look like on a real plate."""
    doc = json.loads(DOCUMENT.read_text())
    box = plate_bounds(doc, ISO_VIEW)
    ox, oy = 28, 90
    out = [
        text(ox, 36, "Plate · Production ECS Est in the kit", "title t"),
        text(
            ox,
            56,
            "Plate: synoptic/ecs-est.json, whole, at the kit's cell size. The dashed rectangle is the app content area on a 1440 × 900 laptop at 100 % "
            "(256 px sidebar, 64 px top bar): what an operator sees before panning.",
            "note tm",
        ),
        frame(ox, oy, plate(doc, ISO_VIEW), box, ISO_VIEW),
    ]
    width, height = box[2] - box[0] + 2 * ox, box[3] - box[1] + oy + ox
    return sheet(round(width), round(height), "\n".join(out), palettes)


if __name__ == "__main__":
    palettes = read_tokens()
    for values, theme in zip(palettes, ("light", "dark"), strict=True):
        check_palette(values, theme)
        check_faces(values, theme)
    (OUT / "isometric.svg").write_text(isometric_sheet(palettes))
    (OUT / "flat.svg").write_text(flat_sheet(palettes))
    (OUT / "density-collector-8.svg").write_text(density_sheet(palettes))
    (OUT / "plate.svg").write_text(plate_sheet(palettes))
