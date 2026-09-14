import { useMemo } from "react";
import {
  symbolSchemas,
  type Cell,
  type LabelElement,
  type Projection,
  type SlotValue,
  type SymbolElement,
  type Synoptic,
} from "@gridone/sdk";
import { fluidFillClass } from "@/lib/fluidColors";
import { Chip, CHIP_H, chipWidth, textWidth } from "./Chip";
import { DepthOrdered, type DepthItem } from "./DepthOrdered";
import { Panel, PANEL_W, panelHeight, type PanelRow } from "./Panel";
import { PidDiagram } from "./PidDiagram";
import { Pipe } from "./Pipe";
import { depthKey, project } from "./projection";
import { pieceAt, runPieces, type RunPiece } from "./runs";
import { Collector } from "./symbols/Collector";
import type { SymbolState } from "./symbols/Label";
import type { CollectorProps } from "./symbols/ports";
import { SynopticSymbol, symbolLabelPoint } from "./symbols/SynopticSymbol";
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
/** A tag's chip sits this far above its cell on the run, the visual
 *  language's fixed lift. On the cell next to a body with height the chip
 *  lands on its top face; moving it below is the editor lint's call. */
const TAG_LIFT = 44;
/** A readout sits this far above the symbol's label. */
const READOUT_GAP = 16;
const TEE_R = 4.5;

/** Type per label role: what the visual language sizes it at. */
const LABEL_FONT: Record<LabelElement["role"], { size: number; cls: string }> =
  {
    title: { size: 18, cls: "fill-foreground text-[18px] font-semibold" },
    caption: {
      size: 11,
      cls: "fill-muted-foreground text-[11px] font-semibold uppercase tracking-wider",
    },
    note: { size: 11, cls: "fill-muted-foreground text-[11px]" },
  };

/** Unknown readings are silent: nothing has arrived for the slot. */
const SILENT: SlotReading = {
  text: null,
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

const stateOf = (reading: SlotReading | undefined): SymbolState | undefined =>
  reading?.raw === true ? "on" : reading?.raw === false ? "off" : undefined;

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
    <PidDiagram width={box.w + 2 * MARGIN} height={box.h + 2 * MARGIN}>
      <g transform={`translate(${MARGIN - box.x} ${MARGIN - box.y})`}>
        <DepthOrdered items={items} />
      </g>
    </PidDiagram>
  );
}

type Box = { x: number; y: number; w: number; h: number };

function buildPlate(doc: Synoptic, values: SynopticValues) {
  const projection = doc.projection ?? "isometric";
  const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
  const pipes = doc.pipes ?? [];
  const items: DepthItem[] = [];
  const extent: Pt[] = [];
  const reading = (key: string, value: SlotValue) =>
    readingOf(values, key, value);

  const pieces = new Map<string, RunPiece[]>();
  for (const pipe of pipes) {
    const run = runPieces(projection, pipe, symbols);
    pieces.set(pipe.id, run);
    const flow = pipe.flow && reading(flowSlotKey(pipe.id), pipe.flow).raw;
    run.forEach((piece, i) => {
      extent.push(...piece.points);
      const last = i === run.length - 1;
      const tee = i === 0 ? pipe.from : last ? pipe.to : undefined;
      items.push({
        id: `${pipe.id}:${i}`,
        depth: depthKey(piece.cell, "pipe"),
        node: (
          <>
            <Pipe
              points={piece.points}
              fluid={pipe.fluid}
              flowing={typeof flow === "boolean" ? flow : undefined}
              endArrow={last}
            />
            {tee?.kind === "pipe" && (
              <circle
                cx={piece.points[1].x}
                cy={piece.points[1].y}
                r={TEE_R}
                data-tee
                className={fluidFillClass(
                  pipes.find((p) => p.id === tee.pipe)?.fluid ?? pipe.fluid,
                )}
              />
            )}
          </>
        ),
      });
    });
    for (const tag of pipe.tags ?? []) {
      const piece = pieceAt(run, tag.at);
      if (!piece) continue;
      const on = piece.points[1];
      const at = { x: on.x, y: on.y - TAG_LIFT };
      const value = tag.value && reading(tagSlotKey(tag.id), tag.value);
      const w = chipWidth(value?.text ?? tag.label);
      extent.push(
        { x: at.x - w / 2, y: at.y - CHIP_H },
        { x: at.x + w / 2, y: at.y },
      );
      items.push({
        id: tag.id,
        depth: depthKey(tag.at, "label"),
        node: (
          <g data-tag={tag.id}>
            <line
              x1={on.x}
              y1={at.y + CHIP_H / 2}
              x2={on.x}
              y2={on.y}
              strokeWidth={1}
              className="stroke-muted-foreground"
            />
            <circle
              cx={on.x}
              cy={on.y}
              r={2.5}
              className={fluidFillClass(pipe.fluid)}
            />
            {value ? (
              <Chip at={at} label={tag.label} reading={value} />
            ) : (
              <text
                x={at.x}
                y={at.y + 4}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px] font-semibold uppercase"
              >
                {tag.label}
              </text>
            )}
          </g>
        ),
      });
    }
  }
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
          ? [{ slot, reading: reading(symbolSlotKey(symbol.id, slot), value) }]
          : [];
      },
    );
    const state = stateOf(readings.find((r) => r.slot === "state")?.reading);
    extent.push(...footprintExtent(projection, symbol, origin));

    const shape = collectorShape(symbol);
    if (shape) {
      items.push({
        id: symbol.id,
        depth: depthKey(origin, "symbol"),
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
      depth: depthKey(origin, "symbol"),
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

    if (readings.length === 0) continue;
    const labelPoint = symbolLabelPoint(
      symbol.type,
      projection,
      origin,
      rotation,
    );
    if (!labelPoint) continue;
    const at = { x: labelPoint.x, y: labelPoint.y - READOUT_GAP };
    items.push({
      id: `${symbol.id}:readout`,
      depth: depthKey(origin, "label"),
      node:
        readings.length === 1 ? (
          <Chip
            at={{ x: at.x, y: at.y - CHIP_H / 2 }}
            reading={readings[0].reading}
          />
        ) : (
          <Panel
            at={at}
            title={symbol.label ?? symbol.id}
            rows={readings.map<PanelRow>(({ slot, reading }) => ({
              label: slotLabel(slot),
              reading,
              error: slot === "fault",
            }))}
            led={state}
            faulty={faulty}
          />
        ),
    });
    const readoutW =
      readings.length === 1
        ? chipWidth(readings[0].reading.text ?? "")
        : PANEL_W;
    const readoutH =
      readings.length === 1 ? CHIP_H : panelHeight(readings.length);
    extent.push(
      { x: at.x - readoutW / 2, y: at.y - readoutH },
      { x: at.x + readoutW / 2, y: at.y },
    );
  }

  for (const label of doc.labels ?? []) {
    const at = project(projection, label.at.x, label.at.y, label.at.z);
    const value = label.value && reading(labelSlotKey(label.id), label.value);
    // A role this build does not know reads as a note rather than crashing.
    const font = LABEL_FONT[label.role] ?? LABEL_FONT.note;
    extent.push(at, {
      x: at.x + textWidth(label.text, font.size),
      y: at.y + (value ? CHIP_H * 1.5 : 0),
    });
    items.push({
      id: label.id,
      depth: depthKey(
        { x: Math.floor(label.at.x), y: Math.floor(label.at.y), z: label.at.z },
        "label",
      ),
      node: (
        <g data-label={label.role}>
          <text x={at.x} y={at.y} className={font.cls}>
            {label.text}
          </text>
          {value && <Chip at={{ x: at.x, y: at.y + CHIP_H }} reading={value} />}
        </g>
      ),
    });
  }

  return { items, box: boundingBox(extent) };
}

/** The authored bar of a collector, or null for any other symbol and for a
 *  collector whose props do not describe one: that one then degrades to the
 *  kit's unknown-type cell rather than crashing the plate. */
function collectorShape(symbol: SymbolElement): CollectorProps | null {
  if (symbol.type !== "collector") return null;
  const props = symbol.props as Partial<CollectorProps> | undefined;
  return props?.axis && props.length ? (props as CollectorProps) : null;
}

/** Projected corners of a symbol's footprint at its floor and two cells
 *  up, which bounds every drawn body. */
function footprintExtent(
  projection: Projection,
  symbol: SymbolElement,
  origin: Cell,
): Pt[] {
  const footprint = symbolSchemas[symbol.type]?.["x-footprint"];
  const bar = collectorShape(symbol);
  const w = footprint?.w ?? (bar?.axis === "x" ? bar.length : 1);
  const d = footprint?.d ?? (bar?.axis === "y" ? bar.length : 1);
  const z = origin.z ?? 0;
  return [0, 2].flatMap((dz) =>
    [
      [0, 0],
      [w, 0],
      [w, d],
      [0, d],
    ].map(([dx, dy]) =>
      project(projection, origin.x + dx, origin.y + dy, z + dz),
    ),
  );
}

function boundingBox(points: Pt[]): Box {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
