import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  symbolSchemas,
  type Cell,
  type LabelElement,
  type PipeElement,
  type Projection,
  type SlotValue,
  type SymbolElement,
  type Synoptic,
} from "@gridone/sdk";
import { fluidFillClass } from "@/lib/fluidColors";
import { Caption, Chip, CHIP_H, chipWidth, DISC_R } from "./Chip";
import { DepthOrdered, type DepthItem } from "./DepthOrdered";
import { faultLevel } from "./fault";
import type { View, ViewportController } from "./hooks/useViewport";
import { Panel, PANEL_W, panelHeight, type PanelRow } from "./Panel";
import { PidDiagram, type CanvasTouchAction } from "./PidDiagram";
import { Pipe } from "./Pipe";
import {
  boxAt,
  bounds as rawBounds,
  CLEARANCE,
  edgePoint,
  findSpot,
  nearest,
  overlaps,
  type Box,
  type Direction,
  type Obstacle,
  type Segment,
} from "./placement";
import {
  DEFAULT_PROJECTION,
  depthKey,
  PIPE_AXIS_Z,
  planeAt,
  project,
  round,
} from "./projection";
import { pieceAt, runPieces, type RunPiece } from "./runs";
import { slabsOf } from "./slabs";
import {
  CollectorLabel,
  collectorLabelAnchor,
  collectorPieces,
} from "./symbols/Collector";
import { KitDefs } from "./symbols/defs";
import { DRAWINGS, INLINE_R, outlineFor, topOf } from "./symbols/drawings";
import { circlePts, silhouette, square } from "./symbols/extrude";
import {
  collectorShape,
  footprintCells,
  footprintSize,
  symbolRotation,
  type PlanRect,
} from "./symbols/footprint";
import { Label, LABEL_SIZE, LED_GAP } from "./symbols/Label";
import { pointsAttr } from "./symbols/plan";
import {
  SynopticSymbol,
  symbolLabelAnchor,
  symbolLabelPoint,
  symbolPoint,
} from "./symbols/SynopticSymbol";
import { Slab } from "./symbols/volume";
import { textWidth } from "./text";
import type { Pt } from "./types";
import {
  EMPTY_VALUES,
  labelSlotKey,
  SILENT_READING,
  stateOf,
  symbolSlotKey,
  tagSlotKey,
  type SlotReading,
  type SynopticValues,
} from "./values";
import { DEFAULT_VOCABULARY, type PlateVocabulary } from "./vocabulary";

/** What the renderer draws: a plate with or without its envelope, so a
 *  document being authored renders before it is stored. */
export type PlateDocument = Omit<Synoptic, "id" | "metadata">;

export { footprintCells } from "./symbols/footprint";

/** What a page does to the plate from outside the svg: the view it
 *  drives, and where a symbol is on screen, for a popover to anchor on. */
export type PlateHandle = {
  /** Brings a symbol to the centre of the canvas, zoomed in to `scale`. */
  focusSymbol: (id: string, scale?: number) => void;
  zoomBy: (k: number) => void;
  fit: () => void;
  /** The screen rectangle of a symbol's body, in client coordinates;
   *  null before layout or for an id the plate does not draw. */
  symbolClientRect: (id: string) => DOMRect | null;
};

type SynopticRendererProps = {
  doc: PlateDocument;
  values?: SynopticValues;
  /** The plates that exist. A link naming one of them navigates; a link
   *  naming another reads missing. Without the set every link is inert. */
  knownSynoptics?: ReadonlySet<string>;
  /** A symbol the user activated: one that is a device, or a link whose
   *  target exists. Nothing else is clickable. */
  onSymbolClick?: (symbol: SymbolElement) => void;
  /** The pointer entered (or left) a drawn symbol. */
  onSymbolHover?: (symbol: SymbolElement | null) => void;
  /** A symbol to ring on the plate: the one a navigation panel points at. */
  highlightId?: string | null;
  /** The words the plate writes, in the page's language; the registry's
   *  own names without it. */
  vocabulary?: PlateVocabulary;
  /** Receives the handle a toolbar or a navigation panel drives the plate
   *  with. */
  plateRef?: RefObject<PlateHandle | null>;
  onViewChange?: (view: View) => void;
  /** Screen points the plate must include besides what it draws: an
   *  editor's grid, so an empty plate still has room. */
  extent?: Pt[];
  touchAction?: CanvasTouchAction;
  /** Painted over the plate, in its frame; `frameRef` receives that frame
   *  so a pointer can be read in plate coordinates. */
  frameRef?: RefObject<SVGGElement>;
  children?: ReactNode;
};

/** Plate margin around the drawn extent, in px. */
const MARGIN = 60;
/** A tag's chip sits this far off its point on the run at first: above
 *  it, or below it when a body stands on the cells the chip would rise
 *  over. */
const TAG_LIFT = 26;
/** A caption sits this far above the chip it names, or below one hung
 *  under its run. */
const TAG_CAPTION_GAP = 14;
/** A single reading hangs this far under the symbol's label. */
const READOUT_GAP = 12;
/** A panel clears the label above it, or the body beside or under it. */
const PANEL_LABEL_GAP = 6;
const PANEL_BODY_GAP = 10;
/** Each ring of the search lies this much further out than the last:
 *  half a cell on screen, so the search steps row by row. */
const RING_STEP = 12;
/** How far the search walks before it hangs the text at its first spot,
 *  in rings: a plate has to be very dense for that to happen. */
const PLACEMENT_RINGS = 16;
/** The sides a tag's text tries, from the side it prefers. */
const TAG_ABOVE: Direction[] = ["N", "S", "NE", "NW", "SE", "SW", "E", "W"];
const TAG_BELOW: Direction[] = ["S", "N", "SE", "SW", "NE", "NW", "E", "W"];
/** The sides a readout tries around its body once the spot at the label
 *  is taken: above, beside, below, then the corners. */
const READOUT_ORDER: Direction[] = ["N", "E", "W", "S", "NE", "NW", "SE", "SW"];
/** The disc at a branch point, a shade wider than the run. */
const TEE_R = 5;
/** Slabs paint before every cell: the floor is under everything. */
const SLAB_PASS = -1_000_000_000;
/** How far a symbol is zoomed in when a page locates it: 200 % (Decision
 *  21 of the visual language). The one definition of the focus zoom. */
const FOCUS_SCALE = 2;
/** The ring around a highlighted symbol stands this far off its body. */
const HIGHLIGHT_PAD = 6;
/** The slot a type binds its fault word to: red on a faulty device. */
const FAULT_SLOT = "fault";

/** Type per free label role, sized by the visual language. Captions draw
 *  through `Caption`, the same caption tags and slots use. */
const LABEL_FONT: Record<
  Exclude<LabelElement["role"], "caption">,
  { size: number; weight: number; cls: string }
> = {
  title: { size: 18, weight: 600, cls: "fill-foreground" },
  note: { size: LABEL_SIZE, weight: 400, cls: "fill-muted-foreground" },
};

/** Unknown readings are silent: nothing has arrived for the slot. */
const SILENT = SILENT_READING;

/** A literal reads as written, as a note; a device slot reads what the
 *  hook holds. */
function readingOf(
  values: SynopticValues,
  key: string,
  value: SlotValue,
): SlotReading {
  if (value.kind === "text") {
    return { ...SILENT, text: value.text, literal: true };
  }
  return values.slots[key] ?? SILENT;
}

/**
 * Turns a stored document into the depth-ordered items of a plate. Symbols
 * and collectors sit at their cell; a run is cut per cell it crosses; tags,
 * readouts and labels paint on top. Values come from `useSynopticValues`;
 * without them every slot is silent.
 */
export function SynopticRenderer({
  doc,
  values = EMPTY_VALUES,
  knownSynoptics,
  onSymbolClick,
  onSymbolHover,
  highlightId,
  vocabulary = DEFAULT_VOCABULARY,
  plateRef,
  onViewChange,
  extent,
  touchAction,
  frameRef,
  children,
}: SynopticRendererProps) {
  // The geometry (runs cut per cell, bodies, what they occupy) depends on
  // the document alone, so a value tick only binds readings to it.
  const geometry = useMemo(() => plateGeometry(doc), [doc]);
  // A hover reaches the page through a ref, so a listener the page
  // re-creates never rebuilds the plate; only whether there is one does,
  // since a plate without a listener wraps nothing.
  const hoverRef = useRef(onSymbolHover);
  useEffect(() => {
    hoverRef.current = onSymbolHover;
  }, [onSymbolHover]);
  const hasHover = !!onSymbolHover;
  const hover = useMemo(
    () =>
      hasHover
        ? (symbol: SymbolElement | null) => hoverRef.current?.(symbol)
        : undefined,
    [hasHover],
  );
  const { items, box } = useMemo(
    () =>
      buildPlate(
        geometry,
        values,
        { knownSynoptics, onSymbolClick, onSymbolHover: hover, vocabulary },
        extent,
      ),
    [
      geometry,
      values,
      knownSynoptics,
      onSymbolClick,
      hover,
      vocabulary,
      extent,
    ],
  );
  // The ring follows the pointer down a navigation list: drawn over the
  // plate from the bodies alone, so a hover never lays the plate out again.
  const highlight = useMemo(
    () => highlightRing(geometry, highlightId),
    [geometry, highlightId],
  );
  const controller = useRef<ViewportController | null>(null);
  const frame = useRef<SVGGElement | null>(null);
  const setFrame = useCallback(
    (el: SVGGElement | null) => {
      frame.current = el;
      if (frameRef) {
        (frameRef as { current: SVGGElement | null }).current = el;
      }
    },
    [frameRef],
  );
  // The plate's frame sits `MARGIN` in from the extent's corner.
  const offset = { x: MARGIN - box.x0, y: MARGIN - box.y0 };
  useImperativeHandle(
    plateRef,
    () => ({
      focusSymbol: (id, scale = FOCUS_SCALE) => {
        const body = geometry.bodies.get(id);
        if (!body) return;
        controller.current?.centerOn(
          {
            x: (body.x0 + body.x1) / 2 + offset.x,
            y: (body.y0 + body.y1) / 2 + offset.y,
          },
          scale,
        );
      },
      zoomBy: (k) => controller.current?.zoomBy(k),
      fit: () => controller.current?.fit(),
      symbolClientRect: (id) => {
        const body = geometry.bodies.get(id);
        // No CTM before layout, or in an environment without one (jsdom).
        const ctm = frame.current?.getScreenCTM?.();
        if (!body || !ctm) return null;
        const a = new DOMPoint(body.x0, body.y0).matrixTransform(ctm);
        const b = new DOMPoint(body.x1, body.y1).matrixTransform(ctm);
        return new DOMRect(
          Math.min(a.x, b.x),
          Math.min(a.y, b.y),
          Math.abs(b.x - a.x),
          Math.abs(b.y - a.y),
        );
      },
    }),
    [geometry, offset.x, offset.y],
  );
  return (
    <PidDiagram
      width={box.x1 - box.x0 + 2 * MARGIN}
      height={box.y1 - box.y0 + 2 * MARGIN}
      touchAction={touchAction}
      controller={controller}
      onViewChange={onViewChange}
    >
      <KitDefs />
      <g ref={setFrame} transform={`translate(${offset.x} ${offset.y})`}>
        <DepthOrdered items={items} />
        {highlight}
        {children}
      </g>
    </PidDiagram>
  );
}

export type { Box } from "./placement";

const bounds = (points: Pt[]): Box => {
  const b = rawBounds(points);
  return { x0: round(b.x0), y0: round(b.y0), x1: round(b.x1), y1: round(b.y1) };
};

const cellKey = (x: number, y: number) => `${x},${y}`;

/** What a document alone decides: the runs cut per cell, every body's
 *  screen corners and box, the cells bodies with height stand on, and the
 *  boxes runs occupy. Computed once per document and shared by every value
 *  tick. */
type Geometry = {
  projection: Projection;
  symbols: Map<string, SymbolElement>;
  pipes: PipeElement[];
  labels: LabelElement[];
  /** The slabs the equipment stands on, in plan cells; none on the sheet. */
  slabs: PlanRect[];
  pieces: Map<string, RunPiece[]>;
  corners: Map<string, Pt[]>;
  bodies: Map<string, Box>;
  bodyCells: Set<string>;
  /** What each symbol keeps readouts off: its body's box, or one box per
   *  cell for a collector (a long bar's box is mostly empty plate). */
  bodyObstacles: Map<string, Box[]>;
  /** Every run piece as the line it draws, casing included. */
  runs: Segment[];
  /** Each symbol's name as the plate places it. */
  placedLabels: Map<string, PlacedLabel>;
  /** The box each symbol's label takes, LED included where the sheet
   *  lights one, so a tag's chip never covers a name or a run-state
   *  light. */
  labelBoxes: Map<string, Box>;
};

/** A symbol's name as the plate places it: its baseline point, how the
 *  text hangs off it, whether it is written on the face, its box, and the
 *  drawn point a leader joins it to once the search has moved it off its
 *  body. */
type PlacedLabel = {
  text: string;
  at: Pt;
  anchor: "start" | "middle" | "end";
  onFace: boolean;
  box: Box;
  leader: Pt | null;
};

/** The sides a displaced name tries around its body: above first, then
 *  beside, then below and the corners. A link's caption tries the side
 *  its arrow points to first, since the plate's edge is there. */
const LABEL_ORDER: Direction[] = ["N", "NE", "NW", "E", "W", "S", "SE", "SW"];
const LABEL_ORDER_RIGHT: Direction[] = [
  "E",
  "NE",
  "SE",
  "N",
  "S",
  "W",
  "NW",
  "SW",
];
const LABEL_ORDER_LEFT: Direction[] = [
  "W",
  "NW",
  "SW",
  "N",
  "S",
  "E",
  "NE",
  "SE",
];
/** A displaced name starts this far off its body. */
const LABEL_GAP = 6;
const LABEL_RINGS = 8;

/** What the surface hosting the plate lets the user do with a symbol. */
type Interaction = Pick<
  SynopticRendererProps,
  "knownSynoptics" | "onSymbolClick" | "onSymbolHover"
> & { vocabulary: PlateVocabulary };

/** Everything the element builders share while a plate is assembled. */
type Plate = Geometry &
  Interaction & {
    values: SynopticValues;
    items: DepthItem[];
    extent: Pt[];
    /** What a chip or panel must keep clear of: every body, bar, inline
     *  glyph and run, then each tag and readout as it is placed. */
    obstacles: Obstacle[];
  };

/** Half the width a run occupies on screen, casing included. */
const RUN_HALF_WIDTH = 5;

function plateGeometry(doc: PlateDocument): Geometry {
  const projection = doc.projection ?? DEFAULT_PROJECTION;
  const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
  const pipes = doc.pipes ?? [];
  const pieces = new Map(
    pipes.map((pipe) => [pipe.id, runPieces(projection, pipe, symbols)]),
  );
  const corners = new Map(
    [...symbols.values()].map((s) => [s.id, symbolCorners(projection, s)]),
  );
  const bodies = new Map(
    [...corners].map(([id, points]) => [id, bounds(points)]),
  );
  const bodyObstacles = new Map(
    [...symbols.values()].map((s) => [
      s.id,
      barCellBoxes(projection, s) ?? [bodies.get(s.id)!],
    ]),
  );
  const bodyCells = new Set<string>();
  for (const symbol of symbols.values()) {
    const drawing = DRAWINGS[symbol.type];
    if (
      symbol.placement.kind === "cell" &&
      drawing &&
      topOf(drawing, projection) > drawing.base
    ) {
      for (const cell of footprintCells(symbol)) {
        bodyCells.add(cellKey(cell.x, cell.y));
      }
    }
  }
  const runs = [...pieces.values()]
    .flat()
    .flatMap((piece) =>
      piece.points
        .slice(1)
        .map((b, i) => ({ a: piece.points[i], b, r: RUN_HALF_WIDTH })),
    );
  const placedLabels = placeLabels(
    projection,
    symbols,
    bodies,
    bodyObstacles,
    corners,
    runs,
  );
  const labelBoxes = new Map(
    [...placedLabels].map(([id, label]) => [id, label.box] as const),
  );
  return {
    projection,
    symbols,
    pipes,
    labels: doc.labels ?? [],
    slabs: projection === "isometric" ? slabsOf(symbols.values()) : [],
    pieces,
    corners,
    bodies,
    bodyObstacles,
    bodyCells,
    runs,
    placedLabels,
    labelBoxes,
  };
}

/** The box a level label takes from its baseline point, `ledW` wide past
 *  the text for the LED the sheet lights after it, lit or not. */
function labelBoxAt(
  at: Pt,
  anchor: PlacedLabel["anchor"],
  w: number,
  ledW: number,
): Box {
  const x0 =
    anchor === "start" ? at.x : anchor === "end" ? at.x - w : at.x - w / 2;
  return {
    x0,
    y0: at.y - LABEL_SIZE,
    x1: x0 + w + ledW,
    y1: at.y,
  };
}

/**
 * Where every symbol's name goes. A collector's lies along its bar, where
 * nothing else is drawn. Any other name takes the kit's spot (above the
 * body, beside a link's arrow, on the face on the sheet) when that spot
 * is clear of every run, every other body and every name placed before
 * it; else the first clear spot around its body, above first, with a
 * leader back to the body once it stands off it. Names are placed before
 * any reading, so a chip never covers one.
 */
function placeLabels(
  projection: Projection,
  symbols: Map<string, SymbolElement>,
  bodies: Map<string, Box>,
  bodyObstacles: Map<string, Box[]>,
  corners: Map<string, Pt[]>,
  runs: Segment[],
): Map<string, PlacedLabel> {
  const placed = new Map<string, PlacedLabel>();
  const taken: Obstacle[] = [...runs];
  const allBodies = [...bodyObstacles.values()].flat();
  for (const symbol of symbols.values()) {
    // The sheet's glyph needs its ISA mark (the `M`, the `kWh`) as a name;
    // the kit's volume draws the mark on the machine itself.
    const mark =
      projection === "flat" ? DRAWINGS[symbol.type]?.mark : undefined;
    const text = symbol.label ?? mark;
    if (!text) continue;
    const origin = symbol.placement.cell;
    const w = textWidth(text, LABEL_SIZE);
    const shape = collectorShape(symbol);
    if (shape) {
      const { at, angle, anchor } = collectorLabelAnchor(
        projection,
        origin,
        shape,
      );
      const box = rotatedTextBox(at, w, LABEL_SIZE, angle, anchor);
      placed.set(symbol.id, {
        text,
        at,
        anchor,
        onFace: false,
        box,
        leader: null,
      });
      taken.push(box);
      continue;
    }
    const spec = symbolLabelAnchor(
      symbol.type,
      projection,
      origin,
      symbolRotation(symbol),
    );
    if (!spec) continue;
    // Room after the text for the LED, only where the sheet lights one:
    // in the isometric view the machine shows its state, and a name judged
    // 14 px wider than it is drawn would be moved out for nothing.
    const ledW = labelHasLed(projection, symbol.type) ? LED_GAP + 2 * LED_R : 0;
    const preferred = labelBoxAt(spec.at, spec.anchor, w, ledW);
    const own = new Set<Obstacle>(bodyObstacles.get(symbol.id) ?? []);
    const others = [...allBodies.filter((b) => !own.has(b)), ...taken];
    let label: PlacedLabel = { text, ...spec, box: preferred, leader: null };
    if (!spec.onFace && others.some((o) => overlaps(preferred, o))) {
      const body = bodies.get(symbol.id)!;
      const order =
        spec.anchor === "start"
          ? LABEL_ORDER_RIGHT
          : spec.anchor === "end"
            ? LABEL_ORDER_LEFT
            : LABEL_ORDER;
      const spot = findSpot(
        body,
        w + ledW,
        LABEL_SIZE,
        [...others, ...own],
        order,
        LABEL_GAP,
        RING_STEP,
        LABEL_RINGS,
      );
      if (spot) {
        const centre = {
          x: (body.x0 + body.x1) / 2,
          y: (body.y0 + body.y1) / 2,
        };
        label = {
          text,
          at: { x: spot.box.x0 + w / 2, y: spot.box.y1 },
          anchor: "middle",
          onFace: false,
          box: spot.box,
          leader:
            spot.ring > 0
              ? nearest(corners.get(symbol.id)!, edgePoint(spot.box, centre))
              : null,
        };
      }
    }
    placed.set(symbol.id, label);
    taken.push(label.box);
  }
  return placed;
}

/** The screen box of a line of text `w` wide and `h` tall whose baseline
 *  starts (or is centred) at `at` and turns by `angle` degrees. */
function rotatedTextBox(
  at: Pt,
  w: number,
  h: number,
  angle: number,
  anchor: "start" | "middle",
): Box {
  const rad = (angle * Math.PI) / 180;
  const x0 = anchor === "start" ? 0 : -w / 2;
  const corners = [
    { x: x0, y: 0 },
    { x: x0 + w, y: 0 },
    { x: x0 + w, y: -h },
    { x: x0, y: -h },
  ].map((p) => ({
    x: at.x + p.x * Math.cos(rad) - p.y * Math.sin(rad),
    y: at.y + p.x * Math.sin(rad) + p.y * Math.cos(rad),
  }));
  return bounds(corners);
}

/** Radius of the run-state LED after a label. */
const LED_R = 4;

/** Whether a symbol's name carries the run-state LED: on the sheet, where
 *  the glyph cannot show the state itself, and never after an isolation
 *  valve, whose bowtie shows it. In the isometric view the machine shows
 *  it (Decision 18), so the name takes no room for one. */
const labelHasLed = (projection: Projection, type: string) =>
  projection === "flat" && type !== "valve_isolation";

const reading = (plate: Plate, key: string, value: SlotValue) =>
  readingOf(plate.values, key, value);

/** Records a placed chip or panel as an obstacle and part of the extent. */
function place(plate: Plate, box: Box) {
  plate.obstacles.push(box);
  plate.extent.push({ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y1 });
}

function buildPlate(
  geometry: Geometry,
  values: SynopticValues,
  interaction: Interaction,
  extra: Pt[] = [],
) {
  const plate: Plate = {
    ...geometry,
    ...interaction,
    values,
    items: [],
    extent: [...[...geometry.corners.values()].flat(), ...extra],
    obstacles: [
      ...[...geometry.bodyObstacles.values()].flat(),
      ...geometry.runs,
      ...geometry.labelBoxes.values(),
    ],
  };
  // The author's free labels stand where they were put: everything else
  // keeps clear of them. Laid out once here, drawn from the same layout.
  const freeLabels = geometry.labels.map(
    (label) => [label, freeLabelLayout(plate, label)] as const,
  );
  for (const [, layout] of freeLabels) plate.obstacles.push(...layout.boxes);
  addSlabs(plate);
  addRuns(plate);
  addSymbols(plate);
  addLabels(plate, freeLabels);
  const { items, extent } = plate;
  return {
    items,
    box: extent.length ? bounds(extent) : { x0: 0, y0: 0, x1: 0, y1: 0 },
  };
}

/** The slabs under the equipment, painted before every cell. Their
 *  corners count into the extent: a slab reaches past the machines it
 *  carries. */
function addSlabs(plate: Plate) {
  const { projection, slabs, items, extent } = plate;
  const P = (x: number, y: number, z: number) => project(projection, x, y, z);
  slabs.forEach((slab, i) => {
    extent.push(
      P(slab.x0, slab.y0, 0),
      P(slab.x1, slab.y0, 0),
      P(slab.x1, slab.y1, 0),
      P(slab.x0, slab.y1, 0),
    );
    items.push({
      id: `slab:${i}`,
      depth: SLAB_PASS + i,
      node: <Slab P={P} x0={slab.x0} y0={slab.y0} x1={slab.x1} y1={slab.y1} />,
    });
  });
}

/** Each run cut per cell, with its chevrons, tee discs and tags. A run is
 *  static whatever its `flow` reads: the machine shows the run state. */
function addRuns(plate: Plate) {
  const { projection, pipes, items, extent, bodyCells, pieces } = plate;

  for (const pipe of pipes) {
    const run = pieces.get(pipe.id)!;
    let arrowAt = run.length - 1;
    while (arrowAt > 0 && run[arrowAt].stub) arrowAt -= 1;
    run.forEach((piece, i) => {
      extent.push(...piece.points);
      items.push({
        id: `${pipe.id}:${i}`,
        depth: depthKey(piece.cell, "pipe"),
        node: (
          <Pipe
            points={piece.points}
            fluid={pipe.fluid}
            endArrow={i === arrowAt}
          />
        ),
      });
      // A tee's disc paints over both runs of its cell, in the trunk's colour.
      const tee = i === 0 ? pipe.from : i === run.length - 1 ? pipe.to : null;
      if (tee?.kind === "pipe") {
        items.push({
          id: `${pipe.id}:${i}:tee`,
          depth: depthKey(piece.cell, "symbol"),
          node: (
            <circle
              cx={piece.points[1].x}
              cy={piece.points[1].y}
              r={TEE_R}
              data-tee
              className={fluidFillClass(
                pipes.find((p) => p.id === tee.pipe)?.fluid ?? pipe.fluid,
              )}
            />
          ),
        });
      }
    });
    for (const tag of pipe.tags ?? []) {
      const piece = pieceAt(run, tag.at);
      if (!piece) continue;
      const on = piece.points[1];
      const value = tag.value && reading(plate, tagSlotKey(tag.id), tag.value);
      // The box holds the caption and the chip: as wide as the wider.
      const w = Math.max(
        value ? chipWidth(value.text ?? "", value.unit, value.literal) : 0,
        textWidth(tag.label, LABEL_SIZE),
      );
      // The chip rises over the cells behind the run unless a body stands
      // there; either way it takes the first lift clear of every body,
      // run, label and readout already placed, the other side next, then
      // further out.
      const bodyBehind = cellsBehind(projection, tag.at).some((c) =>
        bodyCells.has(cellKey(c.x, c.y)),
      );
      const { below, at, captionY, box } = placeTag(
        plate,
        on,
        w,
        // A line code with no reading is its caption alone.
        value ? CHIP_H + TAG_CAPTION_GAP + LABEL_SIZE : LABEL_SIZE,
        bodyBehind ? "below" : "above",
      );
      place(plate, box);
      items.push({
        id: tag.id,
        depth: depthKey(tag.at, "label"),
        node: (
          <g data-tag={tag.id} data-side={below ? "below" : "above"}>
            <Leader
              box={
                value
                  ? {
                      x0: at.x - w / 2,
                      y0: at.y - CHIP_H / 2,
                      x1: at.x + w / 2,
                      y1: at.y + CHIP_H / 2,
                    }
                  : box
              }
              anchor={on}
              kind="tag"
            />
            <circle
              cx={on.x}
              cy={on.y}
              r={DISC_R}
              className={fluidFillClass(pipe.fluid)}
            />
            {value && (
              <Chip
                at={at}
                reading={value}
                label={below ? undefined : tag.label}
                title={plate.vocabulary.readingTitle?.(value, tag.label)}
              />
            )}
            {(!value || below) && (
              <Caption
                at={{ x: at.x, y: value ? captionY : at.y + 4 }}
                text={tag.label}
              />
            )}
          </g>
        ),
      });
    }
  }
}

/** What a symbol offers on click: `device` opens the device it is, `link`
 *  jumps to the plate it names, `missing` marks a link whose target is not
 *  among the known plates. Null is inert, as is everything on a surface
 *  with no click handler. The device comes from `device_id` alone, never
 *  from what the symbol reads. */
type AffordanceKind = "device" | "link" | "missing";

function symbolAffordance(
  symbol: SymbolElement,
  { knownSynoptics, onSymbolClick }: Interaction,
): AffordanceKind | null {
  if (symbol.type === "link") {
    const target = symbol.props?.synoptic_id;
    if (typeof target !== "string" || !knownSynoptics) return null;
    if (!knownSynoptics.has(target)) return "missing";
    return onSymbolClick ? "link" : null;
  }
  return symbol.device_id && onSymbolClick ? "device" : null;
}

/** The clickable wrapper of a symbol. A missing link is drawn faded and
 *  dashed, and is not a button. A press that becomes a pan never reaches
 *  the click: the canvas captures the pointer once it travels, so the
 *  browser fires the click on the canvas, not here. A double click stays
 *  on the symbol too, so it never refits the canvas under the panel it
 *  just opened. */
function Affordance({
  symbol,
  kind,
  onClick,
  children,
}: {
  symbol: SymbolElement;
  kind: AffordanceKind;
  onClick: ((symbol: SymbolElement) => void) | undefined;
  children: ReactNode;
}) {
  if (kind === "missing") {
    return (
      <g
        data-symbol={symbol.id}
        data-missing
        className="opacity-40"
        strokeDasharray="3 2"
      >
        <title>{String(symbol.props?.synoptic_id)}</title>
        {children}
      </g>
    );
  }
  const activate = () => onClick?.(symbol);
  // A double click's second click is not a second activation.
  const onClickOnce = (e: MouseEvent<SVGGElement>) => {
    if (e.detail <= 1) activate();
  };
  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };
  return (
    <g
      data-symbol={symbol.id}
      data-affordance={kind}
      role="button"
      tabIndex={0}
      aria-label={symbol.label ?? symbol.id}
      className="cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onClick={onClickOnce}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      {children}
    </g>
  );
}

/** Each symbol at its cell, with its readout: a chip under the label for
 *  one bound slot, a panel placed clear of the plate for several. */
function addSymbols(plate: Plate) {
  const { projection, symbols, values, items, extent, pieces } = plate;

  for (const symbol of symbols.values()) {
    const placement = symbol.placement;
    const origin = placement.cell;
    const facts = symbol.device_id ? values.devices[symbol.device_id] : null;
    const fault = faultLevel(!!facts?.faulty, facts?.severity);
    // Bound slots in the order the type declares them: state and fault first.
    const readings = (symbolSchemas[symbol.type]?.["x-slots"] ?? []).flatMap(
      (slot) => {
        const value = symbol.bindings?.[slot];
        return value
          ? [
              {
                slot,
                reading: reading(plate, symbolSlotKey(symbol.id, slot), value),
              },
            ]
          : [];
      },
    );
    const state = stateOf(readings.find((r) => r.slot === "state")?.reading);

    const shape = collectorShape(symbol);
    const bodyCell = nearestCell(symbol);
    const affordance = symbolAffordance(symbol, plate);
    const hover = plate.onSymbolHover;
    const wrap = (node: ReactNode) => {
      const clickable = affordance ? (
        <Affordance
          symbol={symbol}
          kind={affordance}
          onClick={plate.onSymbolClick}
        >
          {node}
        </Affordance>
      ) : (
        node
      );
      return hover ? (
        <g
          data-hover={symbol.id}
          onPointerEnter={() => hover(symbol)}
          onPointerLeave={() => hover(null)}
        >
          {clickable}
        </g>
      ) : (
        clickable
      );
    };
    if (shape) {
      // The bar is cut per cell like a run, so a run raised over it paints
      // over the cells it crosses and the bar's own port stubs stay under
      // it. The click and hover target is one transparent bar over the
      // pieces.
      for (const { cell, node } of collectorPieces(projection, origin, shape)) {
        items.push({
          id: `${symbol.id}:${cell.x},${cell.y}`,
          depth: depthKey(cell, "symbol"),
          node,
        });
      }
      if (symbol.label) {
        items.push({
          id: `${symbol.id}:label`,
          depth: depthKey(origin, "label"),
          node: (
            <CollectorLabel
              projection={projection}
              origin={origin}
              shape={shape}
              label={symbol.label}
            />
          ),
        });
      }
      if (affordance || hover) {
        const bar = plate.bodyObstacles.get(symbol.id)!.reduce((a, b) => ({
          x0: Math.min(a.x0, b.x0),
          y0: Math.min(a.y0, b.y0),
          x1: Math.max(a.x1, b.x1),
          y1: Math.max(a.y1, b.y1),
        }));
        items.push({
          id: `${symbol.id}:hit`,
          depth: depthKey(bodyCell, "label"),
          node: wrap(
            <polygon
              points={pointsAttr([
                { x: bar.x0, y: bar.y0 },
                { x: bar.x1, y: bar.y0 },
                { x: bar.x1, y: bar.y1 },
                { x: bar.x0, y: bar.y1 },
              ])}
              fill="transparent"
              data-collector-hit
            />,
          ),
        });
      }
      continue;
    }
    const direction =
      placement.kind === "pipe"
        ? pieceAt(pieces.get(placement.pipe) ?? [], placement.cell)?.direction
        : undefined;
    const rotation = placement.kind === "cell" ? placement.rotation : 0;
    items.push({
      id: symbol.id,
      depth: depthKey(bodyCell, "symbol"),
      node: wrap(
        <SynopticSymbol
          type={symbol.type}
          projection={projection}
          origin={origin}
          rotation={rotation}
          label={symbol.label ?? undefined}
          state={state}
          fault={fault}
          direction={direction}
          showLabel={false}
        />,
      ),
    });

    // The name, placed clear of the plate and painted over it. On the
    // sheet the run state lights an LED after it; in the isometric view
    // the machine shows it itself.
    const placed = plate.placedLabels.get(symbol.id);
    if (placed) {
      extent.push(
        { x: placed.box.x0, y: placed.box.y0 },
        { x: placed.box.x1, y: placed.box.y1 },
      );
      items.push({
        id: `${symbol.id}:label`,
        depth: depthKey(origin, "label"),
        node: (
          <g data-symbol-label={symbol.id}>
            {placed.leader && (
              <Leader box={placed.box} anchor={placed.leader} kind="label" />
            )}
            <Label
              text={placed.text}
              at={placed.at}
              lift={0}
              anchor={placed.anchor}
              onFace={placed.onFace}
              led={labelHasLed(projection, symbol.type) ? state : undefined}
              fault={fault}
            />
          </g>
        ),
      });
    }
    // A reading hangs where the name is, or where it would be on a symbol
    // the drawing leaves unnamed.
    const labelPoint =
      placed?.at ?? symbolLabelPoint(symbol.type, projection, origin, rotation);
    if (!labelPoint) continue;
    if (readings.length === 0) continue;
    const { vocabulary } = plate;
    if (readings.length === 1) {
      const { slot, reading: single } = readings[0];
      const w = chipWidth(single.text ?? "", single.unit, single.literal);
      const { box, anchor, hanging } = placeReadout(
        plate,
        symbol,
        labelPoint,
        w,
        CHIP_H,
        "chip",
      );
      place(plate, box);
      // A chip sent anywhere but under its label is joined to its symbol
      // as a panel is, or it floats with no owner.
      items.push({
        id: `${symbol.id}:readout`,
        depth: depthKey(origin, "label"),
        node: (
          <g data-readout={symbol.id}>
            {!hanging && <Leader box={box} anchor={anchor} kind="chip" />}
            <Chip
              at={{ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }}
              reading={single}
              title={vocabulary.readingTitle?.(
                single,
                vocabulary.slotLabel(slot),
              )}
            />
          </g>
        ),
      });
      continue;
    }
    const h = panelHeight(readings.length);
    const { box, anchor } = placeReadout(
      plate,
      symbol,
      labelPoint,
      PANEL_W,
      h,
      "panel",
    );
    place(plate, box);
    items.push({
      id: `${symbol.id}:readout`,
      depth: depthKey(origin, "label"),
      node: (
        <g data-readout={symbol.id}>
          <Leader box={box} anchor={anchor} kind="panel" />
          <Panel
            at={{ x: (box.x0 + box.x1) / 2, y: box.y1 }}
            title={symbol.label ?? symbol.id}
            rows={readings.map<PanelRow>(({ slot, reading }) => ({
              label: vocabulary.slotLabel(slot),
              reading,
              error: slot === FAULT_SLOT,
              title: vocabulary.readingTitle?.(
                reading,
                vocabulary.slotLabel(slot),
              ),
            }))}
            led={state}
            fault={fault}
          />
        </g>
      ),
    });
  }
}

/** The ring around the symbol a navigation panel points at,
 *  `HIGHLIGHT_PAD` off its body; a bar is ringed as a whole. Painted over
 *  the plate and never hit, so it hides no hover target. */
function highlightRing(
  geometry: Geometry,
  id: string | null | undefined,
): ReactNode {
  const body = id ? geometry.bodies.get(id) : undefined;
  if (!body) return null;
  return (
    <rect
      data-highlight={id}
      x={body.x0 - HIGHLIGHT_PAD}
      y={body.y0 - HIGHLIGHT_PAD}
      width={body.x1 - body.x0 + 2 * HIGHLIGHT_PAD}
      height={body.y1 - body.y0 + 2 * HIGHLIGHT_PAD}
      rx={6}
      strokeWidth={2}
      pointerEvents="none"
      className="fill-ring/10 stroke-ring"
    />
  );
}

/** The 1 px line from the readout's edge nearest the anchor to the anchor,
 *  a drawn corner of the body or the label point. */
function Leader({
  box,
  anchor,
  kind,
}: {
  box: Box;
  anchor: Pt;
  kind: "chip" | "panel" | "tag" | "label";
}) {
  const from = edgePoint(box, anchor);
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={anchor.x}
      y2={anchor.y}
      strokeWidth={1}
      className="stroke-muted-foreground"
      data-leader={kind}
    />
  );
}

/** Where a free label and the reading it may carry go: the text at its
 *  authored point, the chip hanging under it, its left edge on the
 *  text's. `boxes` is what they take on screen. */
function freeLabelLayout(plate: Plate, label: LabelElement) {
  const at = project(plate.projection, label.at.x, label.at.y, label.at.z);
  const value =
    label.value && reading(plate, labelSlotKey(label.id), label.value);
  // A role this build does not know reads as a note rather than crashing.
  const font =
    label.role === "caption"
      ? null
      : (LABEL_FONT[label.role] ?? LABEL_FONT.note);
  const size = font?.size ?? LABEL_SIZE;
  const chipW = value
    ? chipWidth(value.text ?? "", value.unit, value.literal)
    : 0;
  const chipAt = { x: at.x + chipW / 2, y: at.y + CHIP_H };
  const boxes: Box[] = [
    {
      x0: at.x,
      y0: at.y - size,
      x1: at.x + textWidth(label.text, size),
      y1: at.y,
    },
  ];
  if (value) {
    boxes.push({
      x0: at.x,
      y0: chipAt.y - CHIP_H / 2,
      x1: at.x + chipW,
      y1: chipAt.y + CHIP_H / 2,
    });
  }
  return { at, value, font, chipAt, boxes };
}

type FreeLabelLayout = ReturnType<typeof freeLabelLayout>;

/** Free labels, each with the reading it may carry, drawn from the layout
 *  the obstacles were read off. */
function addLabels(
  plate: Plate,
  labels: (readonly [LabelElement, FreeLabelLayout])[],
) {
  const { items, extent } = plate;

  for (const [label, { at, value, font, chipAt, boxes }] of labels) {
    for (const box of boxes) {
      extent.push({ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y1 });
    }
    items.push({
      id: label.id,
      depth: depthKey(
        { x: Math.floor(label.at.x), y: Math.floor(label.at.y), z: label.at.z },
        "label",
      ),
      node: (
        <g data-label={label.role}>
          {font ? (
            <text
              x={at.x}
              y={at.y}
              fontSize={font.size}
              fontWeight={font.weight}
              className={font.cls}
            >
              {label.text}
            </text>
          ) : (
            <Caption at={at} text={label.text} anchor="start" />
          )}
          {value && (
            <Chip
              at={chipAt}
              reading={value}
              title={plate.vocabulary.readingTitle?.(value, label.text)}
            />
          )}
        </g>
      ),
    });
  }
}

/** The footprint cell nearest the viewer, which keys the body's depth: a
 *  body then paints after the run stubs inside its own cells and after
 *  every run behind it, and before every run in front. */
function nearestCell(symbol: SymbolElement): Cell {
  let nearest = symbol.placement.cell;
  for (const cell of footprintCells(symbol)) {
    if (cell.x + cell.y > nearest.x + nearest.y) nearest = cell;
  }
  return nearest;
}

/** One box per cell of a collector's bar, on the pipe axis plane; null for
 *  any other symbol. */
function barCellBoxes(
  projection: Projection,
  symbol: SymbolElement,
): Box[] | null {
  if (!collectorShape(symbol)) return null;
  const plane = planeAt(
    projection,
    (symbol.placement.cell.z ?? 0) + PIPE_AXIS_Z,
  );
  return footprintCells(symbol).map((cell) =>
    bounds(square(cell.x, cell.y, 1, 1).map((p) => plane(p.x, p.y))),
  );
}

/** Projected corners of a symbol's rotated footprint at its floor and at
 *  the top of its drawing, which bound the whole body. An inline glyph
 *  sits on the pipe axis and is smaller than its cell, so its drawn
 *  outline (or the inline disc) is what a leader can end on, never the
 *  cell's corners in the void around it. */
function symbolCorners(projection: Projection, symbol: SymbolElement): Pt[] {
  const { w, d } = footprintSize(symbol);
  const origin = symbol.placement.cell;
  const rotation = symbolRotation(symbol);
  const drawing = DRAWINGS[symbol.type];
  const z = origin.z ?? 0;
  const at = (p: Pt, dz: number) => {
    const q = symbolPoint(origin, rotation, p);
    return project(projection, q.x, q.y, z + dz);
  };
  if (symbol.placement.kind === "pipe" && drawing) {
    const centre = { x: w / 2, y: d / 2 };
    const outline =
      outlineFor(drawing, projection)?.(centre) ?? circlePts(centre, INLINE_R);
    const top = topOf(drawing, projection);
    // A machine on the run rises above the axis in the isometric view:
    // its box is the outline at the axis and at its top.
    return [PIPE_AXIS_Z, ...(top > PIPE_AXIS_Z ? [top] : [])].flatMap((dz) =>
      outline.map((p) => at(p, dz)),
    );
  }
  const volume = projection === "isometric" ? drawing?.iso : undefined;
  if (drawing && volume) {
    // The drawn body's own silhouette, where a leader may end.
    const outline = outlineFor(drawing, projection)?.({ x: w / 2, y: d / 2 });
    if (outline) {
      const world = outline.map((p) => symbolPoint(origin, rotation, p));
      return silhouette(world, z, z + volume.top);
    }
  }
  const levels = drawing
    ? [drawing.base, topOf(drawing, projection)]
    : [PIPE_AXIS_Z];
  return levels.flatMap((dz) =>
    [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d },
    ].map((corner) => at(corner, dz)),
  );
}

/** Cells a chip rising screen-up from a tag's cell would cover. */
function cellsBehind(projection: Projection, cell: Cell): Pt[] {
  const { x, y } = cell;
  if (projection === "flat") return [{ x, y: y - 1 }];
  return [
    { x: x - 1, y: y - 1 },
    { x: x - 1, y },
    { x, y: y - 1 },
  ];
}

/** The screen box a symbol's body takes, for a surface that hits it. */
export const symbolBox = (projection: Projection, symbol: SymbolElement): Box =>
  bounds(symbolCorners(projection, symbol));

/**
 * Where a tag's text hangs: a box holding the chip and its caption, off
 * its point on the run by `TAG_LIFT`, on the preferred side first, the
 * other next, then the diagonals and the sides, each ring a step further
 * out, the first box clear of every obstacle. The caption sits above the
 * chip when the text is above the run, below it when it hangs under.
 */
function placeTag(
  plate: Plate,
  on: Pt,
  w: number,
  h: number,
  prefer: "above" | "below",
): { below: boolean; at: Pt; captionY: number; box: Box } {
  const point = { x0: on.x, y0: on.y, x1: on.x, y1: on.y };
  const order = prefer === "below" ? TAG_BELOW : TAG_ABOVE;
  const box =
    findSpot(
      point,
      w,
      h,
      plate.obstacles,
      order,
      TAG_LIFT,
      RING_STEP,
      PLACEMENT_RINGS,
    )?.box ?? boxAt(point, order[0], TAG_LIFT, w, h);
  const below = box.y0 >= on.y;
  const at = {
    x: (box.x0 + box.x1) / 2,
    y: below ? box.y0 + CHIP_H / 2 : box.y1 - CHIP_H / 2,
  };
  const captionY = below ? box.y1 : box.y0 + LABEL_SIZE;
  return { below, at, captionY, box };
}

/**
 * Where a symbol's readout goes: hanging off the label first (a chip
 * under it, a panel above it), else the first spot clear of every
 * obstacle but the symbol's own body and label, walking the rings around
 * them: above, beside, below, then the corners, each ring a step further
 * out. When every ring is taken the spot at the label is the last resort.
 * The anchor is where a leader ends on the symbol: the label for a spot
 * hanging off it, else the drawn point nearest the readout.
 */
function placeReadout(
  plate: Plate,
  symbol: SymbolElement,
  labelPoint: Pt,
  w: number,
  h: number,
  kind: "chip" | "panel",
): { box: Box; anchor: Pt; hanging: boolean } {
  const body = plate.bodies.get(symbol.id)!;
  const ownLabel = plate.labelBoxes.get(symbol.id);
  const own = new Set<Obstacle | undefined>([
    ...plate.bodyObstacles.get(symbol.id)!,
    ownLabel,
  ]);
  const others = plate.obstacles.filter((o) => !own.has(o));
  const hanging =
    kind === "panel"
      ? {
          box: {
            x0: labelPoint.x - w / 2,
            y0: labelPoint.y - LABEL_SIZE - PANEL_LABEL_GAP - h,
            x1: labelPoint.x + w / 2,
            y1: labelPoint.y - LABEL_SIZE - PANEL_LABEL_GAP,
          },
          anchor: { x: labelPoint.x, y: labelPoint.y - CLEARANCE },
        }
      : {
          box: {
            x0: labelPoint.x - w / 2,
            y0: labelPoint.y + READOUT_GAP - h / 2,
            x1: labelPoint.x + w / 2,
            y1: labelPoint.y + READOUT_GAP + h / 2,
          },
          anchor: labelPoint,
        };
  if (!others.some((o) => overlaps(hanging.box, o))) {
    return { ...hanging, hanging: true };
  }
  // Around the body and its label together, so no spot lands on the name.
  const around = ownLabel ? rawBounds(cornersOf(body, ownLabel)) : body;
  const spot = findSpot(
    around,
    w,
    h,
    ownLabel ? [...others, ownLabel] : others,
    READOUT_ORDER,
    PANEL_BODY_GAP,
    RING_STEP,
    PLACEMENT_RINGS,
  );
  if (!spot) return { ...hanging, hanging: false };
  const centre = {
    x: (body.x0 + body.x1) / 2,
    y: (body.y0 + body.y1) / 2,
  };
  const anchor = nearest(
    plate.corners.get(symbol.id)!,
    edgePoint(spot.box, centre),
  );
  return { box: spot.box, anchor, hanging: false };
}

const cornersOf = (...boxes: Box[]): Pt[] =>
  boxes.flatMap((b) => [
    { x: b.x0, y: b.y0 },
    { x: b.x1, y: b.y1 },
  ]);
