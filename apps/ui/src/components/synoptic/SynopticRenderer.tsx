import { useMemo } from "react";
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
import { PidDiagram } from "./PidDiagram";
import { Pipe } from "./Pipe";
import { depthKey, PIPE_AXIS_Z, project, rotateQuarter } from "./projection";
import { pieceAt, runPieces, type RunPiece } from "./runs";
import { Collector } from "./symbols/Collector";
import { DRAWINGS } from "./symbols/drawings";
import { LABEL_SIZE, type SymbolState } from "./symbols/Label";
import type { CollectorProps } from "./symbols/ports";
import {
  SynopticSymbol,
  symbolLabelPoint,
  symbolPoint,
} from "./symbols/SynopticSymbol";
import { textWidth } from "./text";
import type { Pt } from "./types";
import {
  EMPTY_VALUES,
  flowSlotKey,
  labelSlotKey,
  symbolSlotKey,
  tagSlotKey,
  type SlotReading,
  type SynopticValues,
} from "./values";

type SynopticRendererProps = {
  doc: Synoptic;
  values?: SynopticValues;
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

const slotLabel = (slot: string) => slot.replace(/_/g, " ");

/** The run state a symbol shows: none once the reading is old, since a
 *  stale MARCHE is not a running machine. */
const stateOf = (reading: SlotReading | undefined): SymbolState | undefined =>
  !reading || reading.stale
    ? undefined
    : reading.raw === true
      ? "on"
      : reading.raw === false
        ? "off"
        : undefined;

/**
 * Turns a stored document into the depth-ordered items of a plate. Symbols
 * and collectors sit at their cell; a run is cut per cell it crosses; tags,
 * readouts and labels paint on top. Values come from `useSynopticValues`;
 * without them every slot is silent.
 */
export function SynopticRenderer({
  doc,
  values = EMPTY_VALUES,
}: SynopticRendererProps) {
  const { items, box } = useMemo(() => buildPlate(doc, values), [doc, values]);
  return (
    <PidDiagram
      width={box.x1 - box.x0 + 2 * MARGIN}
      height={box.y1 - box.y0 + 2 * MARGIN}
    >
      <g transform={`translate(${MARGIN - box.x0} ${MARGIN - box.y0})`}>
        <DepthOrdered items={items} />
      </g>
    </PidDiagram>
  );
}

type Box = { x0: number; y0: number; x1: number; y1: number };

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

/** Everything the element builders share while a plate is assembled. */
type Plate = {
  projection: Projection;
  symbols: Map<string, SymbolElement>;
  pipes: PipeElement[];
  values: SynopticValues;
  items: DepthItem[];
  extent: Pt[];
  /** What a chip or panel must keep clear of: every body and bar, every
   *  inline glyph, then each tag and readout as it is placed. */
  obstacles: Box[];
  /** Cells a body with height stands on: a chip rising over one hangs
   *  below its run instead. */
  bodyCells: Set<string>;
  pieces: Map<string, RunPiece[]>;
};

const reading = (plate: Plate, key: string, value: SlotValue) =>
  readingOf(plate.values, key, value);

/** Records a placed chip or panel as an obstacle and part of the extent. */
function place(plate: Plate, box: Box) {
  plate.obstacles.push(box);
  plate.extent.push({ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y1 });
}

function buildPlate(doc: Synoptic, values: SynopticValues) {
  const plate: Plate = {
    projection: doc.projection ?? "isometric",
    symbols: new Map((doc.symbols ?? []).map((s) => [s.id, s])),
    pipes: doc.pipes ?? [],
    values,
    items: [],
    extent: [],
    obstacles: [],
    bodyCells: new Set(),
    pieces: new Map(),
  };
  addBodies(plate);
  addRuns(plate);
  addSymbols(plate);
  addLabels(plate, doc.labels ?? []);
  const { items, extent } = plate;
  return {
    items,
    box: extent.length ? bounds(extent) : { x0: 0, y0: 0, x1: 0, y1: 0 },
  };
}

/** Every body and bar as an obstacle and part of the extent, and the cells
 *  the bodies with height stand on. */
function addBodies(plate: Plate) {
  const { projection, symbols, obstacles, extent, bodyCells } = plate;

  for (const symbol of symbols.values()) {
    const corners = symbolCorners(projection, symbol);
    obstacles.push(bounds(corners));
    extent.push(...corners);
    if (symbol.placement.kind === "cell" && DRAWINGS[symbol.type]?.height) {
      for (const cell of footprintCells(symbol)) {
        bodyCells.add(cellKey(cell.x, cell.y));
      }
    }
  }
}

/** Each run cut per cell, with its arrow, tee discs and tags. */
function addRuns(plate: Plate) {
  const { projection, symbols, pipes, items, extent, bodyCells, pieces } =
    plate;

  for (const pipe of pipes) {
    const run = runPieces(projection, pipe, symbols);
    pieces.set(pipe.id, run);
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
      const below = cellsBehind(projection, tag.at).some((c) =>
        bodyCells.has(cellKey(c.x, c.y)),
      );
      const at = { x: on.x, y: on.y + (below ? TAG_LIFT : -TAG_LIFT) };
      const value = tag.value && reading(plate, tagSlotKey(tag.id), tag.value);
      const captionY = below
        ? at.y + CHIP_H / 2 + TAG_CAPTION_GAP
        : at.y - CHIP_H / 2 - TAG_CAPTION_GAP;
      const w = value
        ? chipWidth(value.text ?? "", value.unit)
        : textWidth(tag.label, LABEL_SIZE);
      place(plate, {
        x0: at.x - w / 2,
        y0: Math.min(at.y - CHIP_H / 2, captionY - LABEL_SIZE),
        x1: at.x + w / 2,
        y1: Math.max(at.y + CHIP_H / 2, captionY),
      });
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

/** Each symbol at its cell, with its readout: a chip under the label for
 *  one bound slot, a panel placed clear of the plate for several. */
function addSymbols(plate: Plate) {
  const { projection, symbols, values, items, extent, obstacles, pieces } =
    plate;

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
    if (shape) {
      items.push({
        id: symbol.id,
        depth: depthKey(bodyCell, "symbol"),
        node: (
          <Collector
            projection={projection}
            origin={origin}
            shape={shape}
            label={symbol.label ?? undefined}
          />
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
      node: (
        <SynopticSymbol
          type={symbol.type}
          projection={projection}
          origin={origin}
          rotation={rotation}
          label={symbol.label ?? undefined}
          state={state}
          faulty={faulty}
          direction={direction}
        />
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
      const at = { x: labelPoint.x, y: labelPoint.y + READOUT_GAP };
      const w = chipWidth(single.text ?? "", single.unit);
      place(plate, {
        x0: at.x - w / 2,
        y0: at.y - CHIP_H / 2,
        x1: at.x + w / 2,
        y1: at.y + CHIP_H / 2,
      });
      items.push({
        id: `${symbol.id}:readout`,
        depth: depthKey(origin, "label"),
        node: <Chip at={at} reading={single} />,
      });
      continue;
    }
    const h = panelHeight(readings.length);
    const { box, anchor } = placePanel(
      projection,
      symbol,
      labelPoint,
      h,
      obstacles,
    );
    place(plate, box);
    // The leader leaves the panel at the point of its edge nearest the anchor.
    const from = {
      x: Math.min(Math.max(anchor.x, box.x0), box.x1),
      y: Math.min(Math.max(anchor.y, box.y0), box.y1),
    };
    items.push({
      id: `${symbol.id}:readout`,
      depth: depthKey(origin, "label"),
      node: (
        <>
          <line
            x1={from.x}
            y1={from.y}
            x2={anchor.x}
            y2={anchor.y}
            strokeWidth={1}
            className="stroke-muted-foreground"
            data-leader
          />
          <Panel
            at={{ x: (box.x0 + box.x1) / 2, y: box.y1 }}
            title={symbol.label ?? symbol.id}
            rows={readings.map<PanelRow>(({ slot, reading }) => ({
              label: slotLabel(slot),
              reading,
              error: slot === FAULT_SLOT,
            }))}
            led={state}
            faulty={faulty}
          />
        </>
      ),
    });
  }
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
function footprintCells(symbol: SymbolElement): Cell[] {
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

/** Projected corners of a symbol's rotated footprint at its floor and at
 *  the top of its drawing, which bound the whole body. An inline glyph
 *  sits on the pipe axis. */
function symbolCorners(projection: Projection, symbol: SymbolElement): Pt[] {
  const { w, d } = footprintSize(symbol);
  const origin = symbol.placement.cell;
  const rotation = symbolRotation(symbol);
  const drawing = DRAWINGS[symbol.type];
  const z = origin.z ?? 0;
  const levels =
    symbol.placement.kind === "pipe" || !drawing
      ? [PIPE_AXIS_Z]
      : [drawing.base, drawing.base + drawing.height];
  return levels.flatMap((dz) =>
    [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d },
    ].map((corner) => {
      const p = symbolPoint(origin, rotation, corner);
      return project(projection, p.x, p.y, z + dz);
    }),
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

/**
 * Where a symbol's panel goes: above its label, else left of the body,
 * else right, else below, the first spot clear of every obstacle; above
 * when none is. The anchor is where the leader ends on the symbol.
 */
function placePanel(
  projection: Projection,
  symbol: SymbolElement,
  labelPoint: Pt,
  h: number,
  obstacles: Box[],
): { box: Box; anchor: Pt } {
  const body = bounds(symbolCorners(projection, symbol));
  const midY = (body.y0 + body.y1) / 2;
  const left = { x: body.x0, y: midY };
  const right = { x: body.x1, y: midY };
  const below = { x: (body.x0 + body.x1) / 2, y: body.y1 };
  const candidates: { x: number; y: number; anchor: Pt }[] = [
    {
      x: labelPoint.x - PANEL_W / 2,
      y: labelPoint.y - PANEL_LABEL_GAP - h,
      anchor: { x: labelPoint.x, y: labelPoint.y - CLEARANCE },
    },
    { x: left.x - PANEL_BODY_GAP - PANEL_W, y: left.y - h / 2, anchor: left },
    { x: right.x + PANEL_BODY_GAP, y: right.y - h / 2, anchor: right },
    { x: below.x - PANEL_W / 2, y: below.y + PANEL_BODY_GAP, anchor: below },
  ];
  const boxed = candidates.map(({ x, y, anchor }) => ({
    box: { x0: x, y0: y, x1: x + PANEL_W, y1: y + h },
    anchor,
  }));
  return (
    boxed.find(({ box }) => !obstacles.some((o) => overlaps(box, o))) ??
    boxed[0]
  );
}
