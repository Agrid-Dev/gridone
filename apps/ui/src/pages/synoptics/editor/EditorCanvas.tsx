import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import type { Cell, SymbolElement } from "@gridone/sdk";
import type { View } from "@/components/synoptic/hooks/useViewport";
import {
  clientToSvg,
  DRAG_THRESHOLD,
  useSvgDrag,
} from "@/components/synoptic/hooks/useSvgDrag";
import { Pipe } from "@/components/synoptic/Pipe";
import {
  portPoint,
  project,
  unproject,
} from "@/components/synoptic/projection";
import {
  axisCentre,
  endpointCell,
  runPieces,
} from "@/components/synoptic/runs";
import {
  symbolBox,
  SynopticRenderer,
  type Box,
  type PlateDocument,
  type PlateHandle,
} from "@/components/synoptic/SynopticRenderer";
import { Collector } from "@/components/synoptic/symbols/Collector";
import { footprintCells } from "@/components/synoptic/symbols/footprint";
import {
  portsOf,
  symbolPort,
  type CollectorProps,
} from "@/components/synoptic/symbols/ports";
import { SynopticSymbol } from "@/components/synoptic/symbols/SynopticSymbol";
import type { Pt } from "@/components/synoptic/types";
import {
  attachedPorts,
  defaultProps,
  routeWaypoints,
  type RoutePoint,
} from "./document";
import { isInline, SYMBOL_DRAG_TYPE } from "./library";
import { pipeName } from "./names";
import { usePlateVocabulary } from "../usePlateVocabulary";
import { cellKey } from "./runRules";
import { nearestRide, rides, type Ride } from "./snap";
import type { SynopticEditorState } from "./useSynopticEditor";

/** The editor always draws the plan: authoring is 2D, whatever view the
 *  plate opens on for its operators. */
const PLAN = "flat" as const;

/** Cells of room around the plate the first time it is framed, and the
 *  least frame an empty plate gets. */
const FRAME_PAD = 8;
const FRAME_MIN = { w: 24, h: 16 };
/** The frame grows this much at a time, when something lands within
 *  `FRAME_EDGE` cells of it. */
const FRAME_CHUNK = 8;
const FRAME_EDGE = 3;
/** Screen px within which a dragged valve snaps onto a run. */
const SNAP_PX = 28;
/** Width of the transparent stroke that makes a run clickable. */
const RUN_HIT_WIDTH = 14;
const HALO = 6;

type Range = { x0: number; y0: number; x1: number; y1: number };

/** The cells the plate uses: every body and every corner of every run. */
function contentRange(doc: PlateDocument): Range | null {
  const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
  const cells: Cell[] = [
    ...(doc.symbols ?? [])
      .filter((s) => s.placement.kind === "cell")
      .flatMap(footprintCells),
    ...(doc.pipes ?? []).flatMap((p) => [
      endpointCell(p.from, symbols),
      endpointCell(p.to, symbols),
      ...(p.waypoints ?? []),
    ]),
  ];
  if (!cells.length) return null;
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs) + 1,
    y1: Math.max(...ys) + 1,
  };
}

/** The first frame of a plate: its content with room around it, at least
 *  the least frame, centred on the content. */
function firstFrame(content: Range | null): Range {
  const c = content ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
  const w = Math.max(c.x1 - c.x0 + 2 * FRAME_PAD, FRAME_MIN.w);
  const h = Math.max(c.y1 - c.y0 + 2 * FRAME_PAD, FRAME_MIN.h);
  const x0 = Math.floor((c.x0 + c.x1 - w) / 2);
  const y0 = Math.floor((c.y0 + c.y1 - h) / 2);
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

/** The frame grown past content that came near an edge; the same object
 *  when nothing did, so the plate does not re-fit for nothing. */
function grownFrame(frame: Range, content: Range | null): Range {
  if (!content) return frame;
  const next = {
    x0:
      content.x0 - FRAME_EDGE < frame.x0 ? content.x0 - FRAME_CHUNK : frame.x0,
    y0:
      content.y0 - FRAME_EDGE < frame.y0 ? content.y0 - FRAME_CHUNK : frame.y0,
    x1:
      content.x1 + FRAME_EDGE > frame.x1 ? content.x1 + FRAME_CHUNK : frame.x1,
    y1:
      content.y1 + FRAME_EDGE > frame.y1 ? content.y1 + FRAME_CHUNK : frame.y1,
  };
  const same =
    next.x0 === frame.x0 &&
    next.y0 === frame.y0 &&
    next.x1 === frame.x1 &&
    next.y1 === frame.y1;
  return same ? frame : next;
}

/** The ports a placed symbol offers, with where each meets a run. */
function symbolPorts(symbol: SymbolElement) {
  if (symbol.placement.kind !== "cell") return [];
  const props = symbol.props as CollectorProps | undefined;
  const { cell, rotation } = symbol.placement;
  return Object.keys(portsOf(symbol.type, props)).flatMap((name) => {
    const anchor = symbolPort(symbol.type, cell, rotation ?? 0, name, props);
    return anchor
      ? [{ name, anchor, at: portPoint(PLAN, anchor.cell, anchor.side) }]
      : [];
  });
}

const square = (c: Cell): Box => {
  const a = project(PLAN, c.x, c.y);
  const b = project(PLAN, c.x + 1, c.y + 1);
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
};

type Hover = { kind: "cell"; cell: Cell } | { kind: "ride"; ride: Ride } | null;

type EditorCanvasProps = {
  editor: SynopticEditorState;
  plateRef: RefObject<PlateHandle | null>;
  onViewChange: (view: View) => void;
};

/** The words under a valve about to be dropped: the run it would ride. */
function DropLabel({ at, text }: { at: Pt; text: string }) {
  const w = 16 + text.length * 7;
  const x = at.x - w / 2;
  const y = at.y + 18;
  return (
    <g data-editor-drop-label>
      <rect
        x={x}
        y={y}
        width={w}
        height={22}
        rx={6}
        strokeWidth={1.5}
        className="fill-background stroke-primary"
      />
      <text
        x={at.x}
        y={y + 15}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        className="fill-foreground"
      >
        {text}
      </text>
    </g>
  );
}

/**
 * The plate drawn as a plan, with the authoring surface over it: a dotted
 * grid, a surface a click lands on a cell of, hit strokes on the runs,
 * hit boxes on the bodies (dragged to move them, their runs following),
 * the ports a run starts and ends on, what is being placed or drawn, and
 * where a symbol dragged from the library would land. Every pointer
 * reading goes through the plate's own frame, so it survives the
 * canvas's pan and zoom.
 */
export function EditorCanvas({
  editor,
  plateRef,
  onViewChange,
}: EditorCanvasProps) {
  const { t } = useTranslation("synoptics");
  const { doc, tool, placing, dragType, draw, drag, selection, errorIds } =
    editor;
  const frameRef = useRef<SVGGElement>(null);
  const gridId = useId();
  const [hover, setHover] = useState<Hover>(null);
  const drawing = tool === "pipe";
  /** What is in hand: a type armed from the library, or dragged from it. */
  const holding = dragType ?? placing;
  const holdingInline = !!holding && isInline(holding);

  const viewDoc = useMemo<PlateDocument>(
    () => ({ ...doc, projection: PLAN }),
    [doc],
  );
  const symbols = useMemo(
    () => new Map((doc.symbols ?? []).map((s) => [s.id, s])),
    [doc.symbols],
  );

  // The frame holds still while a gesture is in flight, and grows only
  // once it lands near an edge: a re-fit mid-drag would move the plate
  // under the pointer.
  const [frame, setFrame] = useState<Range>(() =>
    firstFrame(contentRange(doc)),
  );
  const busy = drag.active || draw.points.length > 0;
  useEffect(() => {
    if (!busy) setFrame((f) => grownFrame(f, contentRange(doc)));
  }, [doc, busy]);
  const extent = useMemo(
    () => [
      project(PLAN, frame.x0, frame.y0),
      project(PLAN, frame.x1, frame.y1),
    ],
    [frame],
  );
  const [topLeft, bottomRight] = extent;

  const runs = useMemo(
    () =>
      (doc.pipes ?? []).map((pipe) => ({
        pipe,
        pieces: runPieces(PLAN, pipe, symbols),
      })),
    [doc.pipes, symbols],
  );
  const rideCells = useMemo(
    () => (holdingInline ? rides(doc) : []),
    [holdingInline, doc],
  );
  const ridePipes = useMemo(
    () => new Set(rideCells.map((r) => r.pipe)),
    [rideCells],
  );
  const rideAt = useMemo(
    () => new Map(rideCells.map((r) => [cellKey(r.cell), r])),
    [rideCells],
  );
  const used = useMemo(
    () =>
      new Map([...symbols.keys()].map((id) => [id, attachedPorts(doc, id)])),
    [doc, symbols],
  );

  /** Plate px under a client point, and the screen px one plate px spans. */
  const toPlate = useCallback((clientX: number, clientY: number) => {
    const frameEl = frameRef.current;
    if (!frameEl) return { point: { x: 0, y: 0 }, scale: 1 };
    const scale = frameEl.getScreenCTM?.()?.a || 1;
    return { point: clientToSvg(frameEl, clientX, clientY), scale };
  }, []);
  const toCell = useCallback(
    (clientX: number, clientY: number, z: number): Cell => {
      const u = unproject(PLAN, toPlate(clientX, clientY).point);
      return { x: Math.floor(u.x), y: Math.floor(u.y), z };
    },
    [toPlate],
  );
  /** Where a held type would land under the pointer: a cell for a
   *  free-standing type, a cell inside a run for an inline one. */
  const landing = useCallback(
    (clientX: number, clientY: number): Hover => {
      if (holdingInline) {
        const { point, scale } = toPlate(clientX, clientY);
        const ride = nearestRide(rideCells, point, SNAP_PX / scale);
        return ride ? { kind: "ride", ride } : null;
      }
      return { kind: "cell", cell: toCell(clientX, clientY, 0) };
    },
    [holdingInline, toPlate, rideCells, toCell],
  );

  const place = useCallback(
    (type: string, at: Hover) => {
      if (!at) return;
      if (at.kind === "ride") {
        editor.place(type, {
          kind: "pipe",
          pipe: at.ride.pipe,
          cell: at.ride.cell,
        });
      } else if (!isInline(type)) {
        editor.place(type, { kind: "cell", cell: at.cell, rotation: 0 });
      }
    },
    [editor],
  );

  // Dragging a type from the library: one listener on the whole canvas,
  // so no child covers a dead zone, resolving the cell by geometry.
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!dragType) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setHover(landing(e.clientX, e.clientY));
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setHover(null);
    }
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const type = e.dataTransfer.getData(SYMBOL_DRAG_TYPE) || dragType;
    if (!type) return;
    e.preventDefault();
    place(type, landing(e.clientX, e.clientY));
    editor.setDragType(null);
    setHover(null);
  };

  const onSurfaceMove = (e: ReactPointerEvent<SVGRectElement>) => {
    if (placing) setHover(landing(e.clientX, e.clientY));
    else if (drawing) {
      setHover({
        kind: "cell",
        cell: toCell(e.clientX, e.clientY, draw.level),
      });
    }
  };
  const onSurfaceClick = (e: MouseEvent<SVGRectElement>) => {
    if (placing) {
      place(placing, landing(e.clientX, e.clientY));
    } else if (drawing) {
      const cell = toCell(e.clientX, e.clientY, draw.level);
      draw.addPoint({ endpoint: { kind: "cell", cell }, cell });
    } else {
      editor.select(null);
    }
  };
  // Leaving the tool or the armed type clears what the pointer showed.
  useEffect(() => {
    if (!placing && !drawing && !dragType) setHover(null);
  }, [placing, drawing, dragType]);

  // One drag for whichever body is grabbed. A free body keeps the offset
  // between the pointer's cell and its origin so it does not jump; a
  // symbol riding a run slides along it, to the ride nearest the pointer.
  const grab = useRef<{
    id: string;
    at: string;
    offset: Pt;
    z: number;
    along?: Ride[];
  } | null>(null);
  const move = useSvgDrag({
    threshold: DRAG_THRESHOLD,
    frame: frameRef,
    onMove: (p) => {
      const g = grab.current;
      if (!g) return;
      if (g.along) {
        const ride = nearestRide(g.along, p, Number.POSITIVE_INFINITY);
        if (!ride || cellKey(ride.cell) === g.at) return;
        g.at = cellKey(ride.cell);
        drag.slide(g.id, ride.cell);
        return;
      }
      const u = unproject(PLAN, p);
      const cell = {
        x: Math.floor(u.x) - g.offset.x,
        y: Math.floor(u.y) - g.offset.y,
        z: g.z,
      };
      if (cellKey(cell) === g.at) return;
      g.at = cellKey(cell);
      drag.to(g.id, cell);
    },
    onEnd: () => {
      const g = grab.current;
      grab.current = null;
      if (!g) return;
      drag.end(g.id);
      // What was just moved is what the author works on next.
      editor.select({ kind: "symbol", id: g.id });
    },
    onCancel: () => {
      grab.current = null;
      drag.cancel();
    },
  });
  // Escape takes a move back while the pointer is still down: the body
  // returns where it stood and no step is left. The keyboard shortcuts
  // stand aside while a drag lasts, so this is Escape's only meaning then.
  const cancelMove = move.cancel;
  useEffect(() => {
    if (!drag.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      cancelMove();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag.active, cancelMove]);

  const preview = useMemo(() => {
    if (!drawing || draw.points.length === 0 || hover?.kind !== "cell") {
      return null;
    }
    const tail: RoutePoint = {
      endpoint: { kind: "cell", cell: hover.cell },
      cell: hover.cell,
    };
    const cells = [
      draw.points[0].cell,
      ...routeWaypoints([...draw.points, tail]),
      hover.cell,
    ];
    return cells.map((c) => axisCentre(PLAN, c));
  }, [drawing, draw.points, hover]);

  const halo = (box: Box, error: boolean) => (
    <rect
      x={box.x0 - HALO}
      y={box.y0 - HALO}
      width={box.x1 - box.x0 + 2 * HALO}
      height={box.y1 - box.y0 + 2 * HALO}
      rx={4}
      fill="none"
      strokeWidth={1.5}
      strokeDasharray={error ? "4 3" : undefined}
      className={error ? "stroke-destructive" : "stroke-ring"}
      pointerEvents="none"
    />
  );
  const { fluidLabel } = usePlateVocabulary();
  const start = draw.points[0];
  const hoverCell = hover?.kind === "cell" ? square(hover.cell) : null;
  const rideRun =
    hover?.kind === "ride"
      ? doc.pipes?.find((p) => p.id === hover.ride.pipe)
      : undefined;

  return (
    <div
      className="h-full w-full"
      data-editor-canvas
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <SynopticRenderer
        doc={viewDoc}
        extent={extent}
        boxed
        fitOnDoubleClick={false}
        animated={false}
        touchAction="none"
        frameRef={frameRef}
        plateRef={plateRef}
        onViewChange={onViewChange}
      >
        <defs>
          <pattern
            id={`${gridId}-dot`}
            x={-20}
            y={-20}
            width={40}
            height={40}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={20} cy={20} r={1.2} className="fill-border" />
          </pattern>
          <pattern
            id={`${gridId}-major`}
            x={-100}
            y={-100}
            width={200}
            height={200}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={100}
              cy={100}
              r={2}
              className="fill-muted-foreground/40"
            />
          </pattern>
        </defs>
        <g data-editor-grid pointerEvents="none">
          {[`${gridId}-dot`, `${gridId}-major`].map((id) => (
            <rect
              key={id}
              x={topLeft.x}
              y={topLeft.y}
              width={bottomRight.x - topLeft.x}
              height={bottomRight.y - topLeft.y}
              fill={`url(#${id})`}
            />
          ))}
        </g>
        {/* The plate's floor: a click here lands on a cell. */}
        <rect
          data-editor-surface
          x={topLeft.x}
          y={topLeft.y}
          width={bottomRight.x - topLeft.x}
          height={bottomRight.y - topLeft.y}
          fill="transparent"
          onPointerMove={onSurfaceMove}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={onSurfaceClick}
          style={{ cursor: placing || drawing ? "crosshair" : "default" }}
        />
        {/* Runs: a transparent stroke per piece, so a click names its cell. */}
        {runs.map(({ pipe, pieces }) => {
          const selected =
            selection?.kind === "pipe" && selection.id === pipe.id;
          const error = errorIds.has(pipe.id);
          const target = ridePipes.has(pipe.id);
          const line = (points: Pt[]) =>
            points.map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <g key={pipe.id} data-editor-pipe={pipe.id}>
              {(selected || error || target) &&
                pieces.map((piece, i) => (
                  <polyline
                    key={i}
                    points={line(piece.points)}
                    fill="none"
                    strokeWidth={target && !selected ? 18 : RUN_HIT_WIDTH}
                    strokeLinecap="round"
                    data-editor-target={target || undefined}
                    className={
                      error
                        ? "stroke-destructive/30"
                        : target && !selected
                          ? "stroke-primary/20"
                          : "stroke-ring/30"
                    }
                    pointerEvents="none"
                  />
                ))}
              {pieces
                .filter((piece) => (piece.cell.z ?? 0) > 0)
                .map((piece, i) => (
                  <polyline
                    key={`raised-${i}`}
                    data-editor-raised
                    points={line(piece.points)}
                    fill="none"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    className="stroke-background"
                    pointerEvents="none"
                  />
                ))}
              {pieces.map((piece, i) => (
                <polyline
                  key={i}
                  data-run-cell={cellKey(piece.cell)}
                  points={line(piece.points)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={RUN_HIT_WIDTH}
                  strokeLinecap="round"
                  style={{ cursor: "pointer" }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (placing) {
                      const ride = rideAt.get(cellKey(piece.cell));
                      if (holdingInline && ride?.pipe === pipe.id) {
                        place(placing, { kind: "ride", ride });
                      } else if (!holdingInline) {
                        place(placing, {
                          kind: "cell",
                          cell: { ...piece.cell, z: 0 },
                        });
                      }
                    } else if (drawing) {
                      draw.addPoint({
                        endpoint: {
                          kind: "pipe",
                          pipe: pipe.id,
                          cell: piece.cell,
                        },
                        cell: piece.cell,
                      });
                    } else {
                      editor.select({ kind: "pipe", id: pipe.id });
                    }
                  }}
                />
              ))}
            </g>
          );
        })}
        {/* Bodies: a hit box each, dragged in the select tool; ports on
            top, offered while a run is drawn. */}
        {[...symbols.values()].map((symbol) => {
          const box = symbolBox(PLAN, symbol);
          const selected =
            selection?.kind === "symbol" && selection.id === symbol.id;
          const error = errorIds.has(symbol.id);
          const free = symbol.placement.kind === "cell";
          const attached = used.get(symbol.id) ?? new Set<string>();
          return (
            <g key={symbol.id} data-editor-symbol={symbol.id}>
              {(selected || error) && halo(box, error && !selected)}
              {!placing && !drawing && (
                <rect
                  x={box.x0}
                  y={box.y0}
                  width={box.x1 - box.x0}
                  height={box.y1 - box.y0}
                  fill="transparent"
                  style={{ cursor: free ? "move" : "ew-resize", ...move.style }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    editor.select({ kind: "symbol", id: symbol.id });
                  }}
                  onPointerDown={(e) => {
                    // The hook first: a press it refuses leaves the drag in
                    // flight alone.
                    if (!move.onPointerDown(e)) return;
                    const { placement } = symbol;
                    const origin = placement.cell;
                    const z = origin.z ?? 0;
                    const at = toCell(e.clientX, e.clientY, z);
                    grab.current = {
                      id: symbol.id,
                      at: cellKey({ ...origin, z }),
                      z,
                      offset: { x: at.x - origin.x, y: at.y - origin.y },
                      along:
                        placement.kind === "pipe"
                          ? rides(doc, symbol.id).filter(
                              (r) => r.pipe === placement.pipe,
                            )
                          : undefined,
                    };
                  }}
                />
              )}
              {drawing &&
                symbolPorts(symbol).map(({ name, anchor, at }) => {
                  const isStart =
                    start?.endpoint.kind === "port" &&
                    start.endpoint.symbol === symbol.id &&
                    start.endpoint.port === name;
                  const state = isStart
                    ? "start"
                    : attached.has(name)
                      ? "used"
                      : "free";
                  return (
                    <g
                      key={name}
                      data-editor-port={`${symbol.id}.${name}`}
                      data-port-state={state}
                      style={{ cursor: "crosshair" }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        draw.addPoint({
                          endpoint: {
                            kind: "port",
                            symbol: symbol.id,
                            port: name,
                          },
                          cell: anchor.cell,
                          side: anchor.side,
                        });
                      }}
                    >
                      <circle cx={at.x} cy={at.y} r={10} fill="transparent" />
                      <circle
                        cx={at.x}
                        cy={at.y}
                        r={state === "used" ? 3.5 : 5}
                        strokeWidth={state === "used" ? 1 : 2}
                        className={
                          state === "start"
                            ? "fill-primary stroke-background"
                            : state === "used"
                              ? "fill-muted-foreground stroke-background"
                              : "fill-background stroke-status-ok"
                        }
                      />
                      <title>{`${symbol.label || symbol.id} · ${name}`}</title>
                    </g>
                  );
                })}
            </g>
          );
        })}
        {/* What the pointer holds: the cell a click lands on, the ghost of
            what it would place, or the run a valve would ride. */}
        {hover && (holding || drawing) && (
          <g pointerEvents="none" data-editor-hover>
            {hover.kind === "cell" && hoverCell && (
              <>
                <rect
                  x={hoverCell.x0}
                  y={hoverCell.y0}
                  width={hoverCell.x1 - hoverCell.x0}
                  height={hoverCell.y1 - hoverCell.y0}
                  fill="none"
                  strokeWidth={1}
                  className="stroke-ring"
                />
                {holding && !holdingInline && (
                  <g opacity={0.5} data-editor-ghost={holding}>
                    {holding === "collector" ? (
                      <Collector
                        projection={PLAN}
                        origin={hover.cell}
                        shape={defaultProps("collector") as CollectorProps}
                      />
                    ) : (
                      <SynopticSymbol
                        type={holding}
                        projection={PLAN}
                        origin={hover.cell}
                        showLabel={false}
                      />
                    )}
                  </g>
                )}
              </>
            )}
            {hover.kind === "ride" && holding && (
              <g
                data-editor-ride={`${hover.ride.pipe}:${cellKey(hover.ride.cell)}`}
              >
                <g opacity={0.7}>
                  <SynopticSymbol
                    type={holding}
                    projection={PLAN}
                    origin={hover.ride.cell}
                    direction={hover.ride.direction}
                    showLabel={false}
                  />
                </g>
                {rideRun && (
                  <DropLabel
                    at={hover.ride.centre}
                    text={t("editor.canvas.dropOn", {
                      run: pipeName(rideRun, fluidLabel),
                    })}
                  />
                )}
              </g>
            )}
          </g>
        )}
        {preview && (
          <g pointerEvents="none" opacity={0.6} data-editor-preview>
            <Pipe points={preview} fluid={draw.fluid} />
          </g>
        )}
      </SynopticRenderer>
    </div>
  );
}
