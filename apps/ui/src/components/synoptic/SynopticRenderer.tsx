import {
  useMemo,
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
import { Panel, PANEL_W, panelHeight, type PanelRow } from "./Panel";
import { PidDiagram, type CanvasTouchAction } from "./PidDiagram";
import { Pipe } from "./Pipe";
import {
  DEFAULT_PROJECTION,
  depthKey,
  PIPE_AXIS_Z,
  planeAt,
  project,
  rotateQuarter,
} from "./projection";
import { pieceAt, runPieces, type RunPiece } from "./runs";
import { Collector, COLLECTOR_LABEL_LIFT } from "./symbols/Collector";
import { DRAWINGS, INLINE_R } from "./symbols/drawings";
import { circlePts, square } from "./symbols/extrude";
import { LABEL_SIZE, LED_GAP, type SymbolState } from "./symbols/Label";
import type { CollectorProps } from "./symbols/ports";
import {
  SynopticSymbol,
  symbolLabelPoint,
  symbolPoint,
} from "./symbols/SynopticSymbol";
import { humanize, textWidth } from "./text";
import type { Pt } from "./types";
import {
  EMPTY_VALUES,
  flowSlotKey,
  labelSlotKey,
  symbolSlotKey,
  tagSlotKey,
  truthOf,
  type SlotReading,
  type SynopticValues,
} from "./values";

/** What the renderer draws: a plate with or without its envelope, so a
 *  document being authored renders before it is stored. */
export type PlateDocument = Omit<Synoptic, "id" | "metadata">;

type SynopticRendererProps = {
  doc: PlateDocument;
  values?: SynopticValues;
  /** The plates that exist. A link naming one of them navigates; a link
   *  naming another reads missing. Without the set every link is inert. */
  knownSynoptics?: ReadonlySet<string>;
  /** A symbol the user activated: one that is a device, or a link whose
   *  target exists. Nothing else is clickable. */
  onSymbolClick?: (symbol: SymbolElement) => void;
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
/** A tag's chip sits this far above its cell on the run, or below it when a
 *  body stands on the cells the chip would rise over. */
const TAG_LIFT = 44;
/** A caption sits this far above the chip it names, or below one hung
 *  under its run. */
const TAG_CAPTION_GAP = 15;
/** A single reading hangs this far under the symbol's label. */
const READOUT_GAP = 16;
/** A panel clears the label above it, or the body beside or under it. */
const PANEL_LABEL_GAP = 8;
const PANEL_BODY_GAP = 20;
/** Two placed things stay this far apart. */
const CLEARANCE = 4;
const TEE_R = 4.5;
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
const SILENT: SlotReading = {
  text: null,
  unit: null,
  raw: null,
  stale: false,
  faulty: false,
};

/** A literal reads as written; a device slot reads what the hook holds. */
function readingOf(
  values: SynopticValues,
  key: string,
  value: SlotValue,
): SlotReading {
  if (value.kind === "text") return { ...SILENT, text: value.text };
  return values.slots[key] ?? SILENT;
}

/** The run state a symbol shows: none once the reading is old, since a
 *  stale MARCHE is not a running machine. */
const stateOf = (reading: SlotReading | undefined): SymbolState | undefined => {
  if (!reading || reading.stale) return undefined;
  const on = truthOf(reading.raw);
  return on === undefined ? undefined : on ? "on" : "off";
};

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
  extent,
  touchAction,
  frameRef,
  children,
}: SynopticRendererProps) {
  // The geometry (runs cut per cell, bodies, what they occupy) depends on
  // the document alone, so a value tick only binds readings to it.
  const geometry = useMemo(() => plateGeometry(doc), [doc]);
  const { items, box } = useMemo(
    () =>
      buildPlate(geometry, values, { knownSynoptics, onSymbolClick }, extent),
    [geometry, values, knownSynoptics, onSymbolClick, extent],
  );
  return (
    <PidDiagram
      width={box.x1 - box.x0 + 2 * MARGIN}
      height={box.y1 - box.y0 + 2 * MARGIN}
      touchAction={touchAction}
    >
      <g
        ref={frameRef}
        transform={`translate(${MARGIN - box.x0} ${MARGIN - box.y0})`}
      >
        <DepthOrdered items={items} />
        {children}
      </g>
    </PidDiagram>
  );
}

export type Box = { x0: number; y0: number; x1: number; y1: number };

const bounds = (points: Pt[]): Box => ({
  x0: Math.min(...points.map((p) => p.x)),
  y0: Math.min(...points.map((p) => p.y)),
  x1: Math.max(...points.map((p) => p.x)),
  y1: Math.max(...points.map((p) => p.y)),
});

const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 + CLEARANCE &&
  b.x0 < a.x1 + CLEARANCE &&
  a.y0 < b.y1 + CLEARANCE &&
  b.y0 < a.y1 + CLEARANCE;

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
  pieces: Map<string, RunPiece[]>;
  corners: Map<string, Pt[]>;
  bodies: Map<string, Box>;
  bodyCells: Set<string>;
  /** What each symbol keeps readouts off: its body's box, or one box per
   *  cell for a collector (a long bar's box is mostly empty plate). */
  bodyObstacles: Map<string, Box[]>;
  runs: Box[];
  /** The box each symbol's label takes, LED included, so a tag's chip
   *  never covers a name or a run-state light. */
  labelBoxes: Map<string, Box>;
};

/** What the surface hosting the plate lets the user do with a symbol. */
type Interaction = Pick<
  SynopticRendererProps,
  "knownSynoptics" | "onSymbolClick"
>;

/** Everything the element builders share while a plate is assembled. */
type Plate = Geometry &
  Interaction & {
    values: SynopticValues;
    items: DepthItem[];
    extent: Pt[];
    /** What a chip or panel must keep clear of: every body, bar, inline
     *  glyph and run, then each tag and readout as it is placed. */
    obstacles: Box[];
  };

/** Half the width a run occupies on screen, casing included. */
const RUN_HALF_WIDTH = 4;

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
    if (symbol.placement.kind === "cell" && DRAWINGS[symbol.type]?.height) {
      for (const cell of footprintCells(symbol)) {
        bodyCells.add(cellKey(cell.x, cell.y));
      }
    }
  }
  const runs = [...pieces.values()].flat().map((piece) => {
    const b = bounds(piece.points);
    return {
      x0: b.x0 - RUN_HALF_WIDTH,
      y0: b.y0 - RUN_HALF_WIDTH,
      x1: b.x1 + RUN_HALF_WIDTH,
      y1: b.y1 + RUN_HALF_WIDTH,
    };
  });
  const labelBoxes = new Map(
    [...symbols.values()].flatMap((symbol) => {
      const box = symbolLabelBox(projection, symbol);
      return box ? [[symbol.id, box] as const] : [];
    }),
  );
  return {
    projection,
    symbols,
    pipes,
    labels: doc.labels ?? [],
    pieces,
    corners,
    bodies,
    bodyObstacles,
    bodyCells,
    runs,
    labelBoxes,
  };
}

/** Where a symbol's label sits on screen, its LED allowance included: the
 *  kit's label point for a drawn type, the bar's lifted origin for a
 *  collector. Null for a symbol that draws no text. */
function symbolLabelBox(
  projection: Projection,
  symbol: SymbolElement,
): Box | null {
  const text = symbol.label ?? DRAWINGS[symbol.type]?.mark;
  if (!text) return null;
  const origin = symbol.placement.cell;
  const shape = collectorShape(symbol);
  const at = shape
    ? (() => {
        const p = planeAt(projection, (origin.z ?? 0) + PIPE_AXIS_Z)(
          origin.x + 0.5,
          origin.y + 0.5,
        );
        return { x: p.x, y: p.y - COLLECTOR_LABEL_LIFT };
      })()
    : symbolLabelPoint(symbol.type, projection, origin, symbolRotation(symbol));
  if (!at) return null;
  const half = textWidth(text, LABEL_SIZE) / 2;
  return {
    x0: at.x - half,
    y0: at.y - LABEL_SIZE,
    // The LED sits after the text; leave it room whether or not it is lit.
    x1: at.x + half + LED_GAP + 2 * LED_R,
    y1: at.y,
  };
}

/** Radius of the run-state LED after a label. */
const LED_R = 4;

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
  addRuns(plate);
  addSymbols(plate);
  addLabels(plate, geometry.labels);
  const { items, extent } = plate;
  return {
    items,
    box: extent.length ? bounds(extent) : { x0: 0, y0: 0, x1: 0, y1: 0 },
  };
}

/** Each run cut per cell, with its arrow, tee discs and tags. */
function addRuns(plate: Plate) {
  const { projection, pipes, items, extent, bodyCells, pieces } = plate;

  for (const pipe of pipes) {
    const run = pieces.get(pipe.id)!;
    const flow = pipe.flow && reading(plate, flowSlotKey(pipe.id), pipe.flow);
    const flowing = !!flow && !flow.stale && flow.raw === true;
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
            flowing={flowing}
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
      const w = value
        ? chipWidth(value.text ?? "", value.unit)
        : textWidth(tag.label, LABEL_SIZE);
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
        bodyBehind ? "below" : "above",
      );
      place(plate, box);
      items.push({
        id: tag.id,
        depth: depthKey(tag.at, "label"),
        node: (
          <g data-tag={tag.id} data-side={below ? "below" : "above"}>
            <line
              x1={on.x}
              y1={at.y + (below ? -CHIP_H / 2 : CHIP_H / 2)}
              x2={on.x}
              y2={on.y}
              strokeWidth={1}
              className="stroke-muted-foreground"
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
    const faulty =
      !!symbol.device_id && !!values.faultyDevices[symbol.device_id];
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
    const wrap = (node: ReactNode) =>
      affordance ? (
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
    if (shape) {
      items.push({
        id: symbol.id,
        depth: depthKey(bodyCell, "symbol"),
        node: wrap(
          <Collector
            projection={projection}
            origin={origin}
            shape={shape}
            label={symbol.label ?? undefined}
          />,
        ),
      });
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
          faulty={faulty}
          direction={direction}
        />,
      ),
    });

    const labelPoint = symbolLabelPoint(
      symbol.type,
      projection,
      origin,
      rotation,
    );
    if (!labelPoint) continue;
    extent.push(labelPoint);
    if (readings.length === 0) continue;
    if (readings.length === 1) {
      const { reading: single } = readings[0];
      const w = chipWidth(single.text ?? "", single.unit);
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
              label: humanize(slot),
              reading,
              error: slot === FAULT_SLOT,
            }))}
            led={state}
            faulty={faulty}
          />
        </g>
      ),
    });
  }
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
  kind: "chip" | "panel";
}) {
  return (
    <line
      x1={Math.min(Math.max(anchor.x, box.x0), box.x1)}
      y1={Math.min(Math.max(anchor.y, box.y0), box.y1)}
      x2={anchor.x}
      y2={anchor.y}
      strokeWidth={1}
      className="stroke-muted-foreground"
      data-leader={kind}
    />
  );
}

/** Free labels, each with the reading it may carry. */
function addLabels(plate: Plate, labels: LabelElement[]) {
  const { projection, items, extent } = plate;

  for (const label of labels) {
    const at = project(projection, label.at.x, label.at.y, label.at.z);
    const value =
      label.value && reading(plate, labelSlotKey(label.id), label.value);
    // A role this build does not know reads as a note rather than crashing.
    const font =
      label.role === "caption"
        ? null
        : (LABEL_FONT[label.role] ?? LABEL_FONT.note);
    const size = font?.size ?? LABEL_SIZE;
    const chipW = value ? chipWidth(value.text ?? "", value.unit) : 0;
    extent.push(
      { x: at.x, y: at.y - size },
      { x: at.x + Math.max(textWidth(label.text, size), chipW), y: at.y },
    );
    // A reading hangs under the text, its left edge on the text's.
    const chipAt = { x: at.x + chipW / 2, y: at.y + CHIP_H };
    if (value) extent.push({ x: chipAt.x, y: chipAt.y + CHIP_H / 2 });
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
          {value && <Chip at={chipAt} reading={value} />}
        </g>
      ),
    });
  }
}

/** The authored bar of a collector, or null for any other symbol and for a
 *  collector whose props do not describe one: that one then degrades to the
 *  kit's unknown-type cell rather than crashing the plate. */
function collectorShape(symbol: SymbolElement): CollectorProps | null {
  if (symbol.type !== "collector") return null;
  const props = symbol.props as Partial<CollectorProps> | undefined;
  return props?.axis && props.length ? (props as CollectorProps) : null;
}

/** Footprint of a symbol in cells at rotation 0: the type's, the authored
 *  bar's, or one cell. */
function footprintSize(symbol: SymbolElement): { w: number; d: number } {
  const footprint = symbolSchemas[symbol.type]?.["x-footprint"];
  const bar = collectorShape(symbol);
  return {
    w: footprint?.w ?? (bar?.axis === "x" ? bar.length : 1),
    d: footprint?.d ?? (bar?.axis === "y" ? bar.length : 1),
  };
}

const symbolRotation = (symbol: SymbolElement) =>
  symbol.placement.kind === "cell" ? (symbol.placement.rotation ?? 0) : 0;

/** The cells a symbol's footprint covers, turned by its rotation. */
export function footprintCells(symbol: SymbolElement): Cell[] {
  const { w, d } = footprintSize(symbol);
  const origin = symbol.placement.cell;
  const rotation = symbolRotation(symbol);
  const cells: Cell[] = [];
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < d; y++) {
      const r = rotateQuarter({ x, y }, rotation);
      cells.push({ x: origin.x + r.x, y: origin.y + r.y, z: origin.z });
    }
  }
  return cells;
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
    const outline = drawing.outline?.(centre) ?? circlePts(centre, INLINE_R);
    return outline.map((p) => at(p, PIPE_AXIS_Z));
  }
  const levels = drawing
    ? [drawing.base, drawing.base + drawing.height]
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

const nearest = (points: Pt[], to: Pt): Pt =>
  points.reduce((best, p) =>
    Math.hypot(p.x - to.x, p.y - to.y) <
    Math.hypot(best.x - to.x, best.y - to.y)
      ? p
      : best,
  );

/**
 * Where a tag's chip hangs: `TAG_LIFT` above or below its point on the run,
 * the preferred side first, the other next, then both again further out,
 * the first box clear of every obstacle. The box holds the chip and its
 * caption, above the chip when the chip is above the run, below it when
 * it hangs below.
 */
function placeTag(
  plate: Plate,
  on: Pt,
  w: number,
  prefer: "above" | "below",
): { below: boolean; at: Pt; captionY: number; box: Box } {
  const candidate = (below: boolean, lift: number) => {
    const at = { x: on.x, y: on.y + (below ? lift : -lift) };
    const captionY = below
      ? at.y + CHIP_H / 2 + TAG_CAPTION_GAP
      : at.y - CHIP_H / 2 - TAG_CAPTION_GAP;
    return {
      below,
      at,
      captionY,
      box: {
        x0: at.x - w / 2,
        y0: Math.min(at.y - CHIP_H / 2, captionY - LABEL_SIZE),
        x1: at.x + w / 2,
        y1: Math.max(at.y + CHIP_H / 2, captionY),
      },
    };
  };
  const sides = prefer === "below" ? [true, false] : [false, true];
  for (let gap = 0; gap < PLACEMENT_RINGS; gap++) {
    for (const below of sides) {
      const c = candidate(below, TAG_LIFT + PANEL_BODY_GAP * gap);
      if (!plate.obstacles.some((o) => overlaps(c.box, o))) return c;
    }
  }
  return candidate(sides[0], TAG_LIFT);
}

/** How many times the gaps widen when every spot of a ring is taken. */
const PLACEMENT_RINGS = 3;

/**
 * Where a symbol's readout goes: a panel above the label, a chip under it,
 * else left of the body, right, below, then the four corners, the first
 * spot clear of every obstacle but the symbol's own body, whose box the
 * spots are measured from. When a ring of eight is taken the gaps widen
 * and the ring is tried again, up to `PLACEMENT_RINGS`; the first spot is
 * the last resort. The anchor is where a panel's leader ends on the symbol.
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
  const own = new Set([...plate.bodyObstacles.get(symbol.id)!, ownLabel]);
  const others = plate.obstacles.filter((o) => !own.has(o));
  const midY = (body.y0 + body.y1) / 2;
  const left = { x: body.x0, y: midY };
  const right = { x: body.x1, y: midY };
  const below = { x: (body.x0 + body.x1) / 2, y: body.y1 };
  const ring = (gap: number): { x: number; y: number; anchor: Pt }[] => [
    kind === "panel"
      ? {
          x: labelPoint.x - w / 2,
          y: labelPoint.y - PANEL_LABEL_GAP * gap - h,
          anchor: { x: labelPoint.x, y: labelPoint.y - CLEARANCE },
        }
      : {
          x: labelPoint.x - w / 2,
          y: labelPoint.y + READOUT_GAP * gap - h / 2,
          anchor: labelPoint,
        },
    { x: left.x - PANEL_BODY_GAP * gap - w, y: left.y - h / 2, anchor: left },
    { x: right.x + PANEL_BODY_GAP * gap, y: right.y - h / 2, anchor: right },
    { x: below.x - w / 2, y: below.y + PANEL_BODY_GAP * gap, anchor: below },
    ...[
      { x: body.x0, y: body.y0, dx: -1, dy: -1 },
      { x: body.x1, y: body.y0, dx: 1, dy: -1 },
      { x: body.x0, y: body.y1, dx: -1, dy: 1 },
      { x: body.x1, y: body.y1, dx: 1, dy: 1 },
    ].map((corner) => ({
      x:
        corner.x +
        (corner.dx > 0 ? PANEL_BODY_GAP * gap : -PANEL_BODY_GAP * gap - w),
      y:
        corner.y +
        (corner.dy > 0 ? PANEL_BODY_GAP * gap : -PANEL_BODY_GAP * gap - h),
      // A box corner of an isometric body is not on its silhouette: the
      // leader ends at the drawn corner nearest to it instead.
      anchor: nearest(plate.corners.get(symbol.id)!, corner),
    })),
  ];
  // The first spot of a ring hangs off the symbol's label, a panel above it
  // and a chip under it; only on the first ring is it close enough to need
  // no leader.
  const boxed = (gap: number) =>
    ring(gap).map(({ x, y, anchor }, i) => ({
      box: { x0: x, y0: y, x1: x + w, y1: y + h },
      anchor,
      underLabel: i === 0,
      hanging: i === 0 && gap === 1,
    }));
  for (let gap = 1; gap <= PLACEMENT_RINGS; gap++) {
    const clear = boxed(gap).find(
      ({ box, underLabel }) =>
        !others.some((o) => overlaps(box, o)) &&
        // Only the spot hanging off the symbol's label may touch that label;
        // any other spot must clear it like every other label.
        (underLabel || !ownLabel || !overlaps(box, ownLabel)),
    );
    if (clear) return clear;
  }
  return boxed(1)[0];
}
