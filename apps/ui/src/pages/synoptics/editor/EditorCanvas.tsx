import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  symbolSchemas,
  type Cell,
  type Fluid,
  type Projection,
  type SymbolElement,
} from "@gridone/sdk";
import {
  axisCentre,
  clientToSvg,
  collectorPorts,
  DEFAULT_PROJECTION,
  DRAG_THRESHOLD,
  footprintCells,
  endpointCell,
  Pipe,
  Port,
  portPoint,
  project,
  runPieces,
  symbolBox,
  symbolPort,
  SynopticRenderer,
  SynopticSymbol,
  unproject,
  useSvgDrag,
  type Box,
  type CollectorProps,
  type PlateDocument,
  type Pt,
} from "@/components/synoptic";
import { routeWaypoints, type RoutePoint, type Selection } from "./document";

export type EditorMode = "select" | "draw";

type EditorCanvasProps = {
  doc: PlateDocument;
  mode: EditorMode;
  /** Height, in cells, the next click lands at. */
  level: number;
  fluid: Fluid;
  /** A symbol type armed from the palette: the next click places it. */
  placing: string | null;
  selection: Selection;
  /** Ids of the elements the last save refused. */
  errorIds: ReadonlySet<string>;
  onSelect: (selection: Selection) => void;
  onPlace: (type: string, placement: SymbolElement["placement"]) => void;
  onDraw: (points: RoutePoint[]) => void;
  onMove: (id: string, cell: Cell) => void;
  onDelete: (selection: Selection) => void;
  onRotate: (id: string) => void;
  onCancel: () => void;
};

/** Cells of grid shown around the plate. */
const GRID_PAD = 2;
/** The grid an empty plate offers. */
const EMPTY_SPAN = 8;
/** Width of the transparent stroke that makes a run clickable. */
const RUN_HIT_WIDTH = 14;
const HALO = 6;

const cellKey = (c: Cell) => `${c.x},${c.y},${c.z ?? 0}`;

/** The cells the plate uses, so the grid is drawn around them. */
function plateCells(doc: PlateDocument): Cell[] {
  const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
  return [
    ...(doc.symbols ?? []).flatMap(footprintCells),
    ...(doc.pipes ?? []).flatMap((p) => [
      endpointCell(p.from, symbols),
      endpointCell(p.to, symbols),
      ...(p.waypoints ?? []),
    ]),
  ];
}

type Range = { x0: number; y0: number; x1: number; y1: number };

function gridRange(cells: Cell[]): Range {
  if (cells.length === 0)
    return { x0: 0, y0: 0, x1: EMPTY_SPAN, y1: EMPTY_SPAN };
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  return {
    x0: Math.min(...xs) - GRID_PAD,
    y0: Math.min(...ys) - GRID_PAD,
    x1: Math.max(...xs) + 1 + GRID_PAD,
    y1: Math.max(...ys) + 1 + GRID_PAD,
  };
}

/** The ports a placed symbol offers, with where each meets a run. */
function symbolPorts(projection: Projection, symbol: SymbolElement) {
  if (symbol.placement.kind !== "cell") return [];
  const schema = symbolSchemas[symbol.type];
  const props = symbol.props as CollectorProps | undefined;
  const names = schema
    ? Object.keys(
        schema["x-ports-authored"]
          ? props?.ports
            ? collectorPorts(props)
            : {}
          : schema["x-ports"],
      ).filter(
        (name) =>
          !schema["x-ports-authored"] ||
          typeof props?.ports?.[name]?.offset === "number",
      )
    : [];
  const { cell, rotation } = symbol.placement;
  return names.flatMap((name) => {
    const anchor = symbolPort(symbol.type, cell, rotation ?? 0, name, props);
    return anchor
      ? [{ name, anchor, at: portPoint(projection, anchor.cell, anchor.side) }]
      : [];
  });
}

const diamond = (projection: Projection, c: Cell): string =>
  [
    [c.x, c.y],
    [c.x + 1, c.y],
    [c.x + 1, c.y + 1],
    [c.x, c.y + 1],
  ]
    .map(([x, y]) => {
      const p = project(projection, x, y, c.z ?? 0);
      return `${p.x},${p.y}`;
    })
    .join(" ");

/** Keys pressed while the author works a field, a dropdown or the
 *  inspector belong to that control, not to the plate. */
const inControl = (e: KeyboardEvent) =>
  e.target instanceof Element &&
  !!e.target.closest(
    "aside, input, textarea, select, [role=listbox], [role=combobox], [contenteditable=true]",
  );
const onButton = (e: KeyboardEvent) =>
  e.target instanceof Element && !!e.target.closest("button");

/**
 * The plate drawn by the renderer, with the authoring surface over it: a
 * grid, the ports a run can attach to, transparent hit areas on bodies
 * and runs, the ghost of a symbol being placed and the run being drawn.
 * Every pointer reading goes through the plate's own frame, so it survives
 * the canvas pan and zoom and the renderer's margin.
 */
export function EditorCanvas({
  doc,
  mode,
  level,
  fluid,
  placing,
  selection,
  errorIds,
  onSelect,
  onPlace,
  onDraw,
  onMove,
  onDelete,
  onRotate,
  onCancel,
}: EditorCanvasProps) {
  const projection = doc.projection ?? DEFAULT_PROJECTION;
  const frameRef = useRef<SVGGElement>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const drawing = mode === "draw";

  const symbols = useMemo(
    () => new Map((doc.symbols ?? []).map((s) => [s.id, s])),
    [doc.symbols],
  );
  const range = useMemo(() => gridRange(plateCells(doc)), [doc]);
  const extent = useMemo(
    () =>
      [
        [range.x0, range.y0],
        [range.x1, range.y0],
        [range.x0, range.y1],
        [range.x1, range.y1],
      ].map(([x, y]) => project(projection, x, y)),
    [projection, range],
  );
  const runs = useMemo(
    () =>
      (doc.pipes ?? []).map((pipe) => ({
        pipe,
        pieces: runPieces(projection, pipe, symbols),
        // An inline symbol sits strictly inside a run: its end cells refuse it.
        ends: [
          endpointCell(pipe.from, symbols),
          endpointCell(pipe.to, symbols),
        ],
      })),
    [doc.pipes, projection, symbols],
  );

  const toCell = useCallback(
    (clientX: number, clientY: number, z: number): Cell => {
      const frame = frameRef.current;
      if (!frame) return { x: 0, y: 0, z };
      const u = unproject(projection, clientToSvg(frame, clientX, clientY), z);
      return { x: Math.floor(u.x), y: Math.floor(u.y), z };
    },
    [projection],
  );

  useEffect(() => {
    setPoints([]);
  }, [mode]);

  /** Adds a point to the run being drawn; a port or a tee after the first
   *  point ends it. */
  const addPoint = useCallback(
    (point: RoutePoint) => {
      const last = points[points.length - 1];
      if (
        last &&
        JSON.stringify(last.endpoint) === JSON.stringify(point.endpoint)
      ) {
        return;
      }
      const next = [...points, point];
      const ends = next.length > 1 && point.endpoint.kind !== "cell";
      if (ends) {
        onDraw(next);
        setPoints([]);
      } else {
        setPoints(next);
      }
    },
    [points, onDraw],
  );

  const finish = useCallback(() => {
    if (points.length > 1) onDraw(points);
    setPoints([]);
  }, [points, onDraw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inControl(e)) return;
      if (e.key === "Escape") {
        setPoints([]);
        onCancel();
      } else if (e.key === "Enter" && points.length > 1 && !onButton(e)) {
        finish();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection) {
        e.preventDefault();
        onDelete(selection);
      } else if (e.key.toLowerCase() === "r" && selection?.kind === "symbol") {
        onRotate(selection.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [points.length, selection, finish, onCancel, onDelete, onRotate]);

  // One drag for whichever symbol is grabbed; the grab keeps the offset
  // between the pointer's cell and the origin so the body does not jump.
  const grab = useRef<{ id: string; offset: Pt; z: number } | null>(null);
  const move = useSvgDrag({
    threshold: DRAG_THRESHOLD,
    frame: frameRef,
    onMove: (p) => {
      const g = grab.current;
      if (!g) return;
      const u = unproject(projection, p, g.z);
      onMove(g.id, {
        x: Math.floor(u.x) - g.offset.x,
        y: Math.floor(u.y) - g.offset.y,
        z: g.z,
      });
    },
    onEnd: () => {
      grab.current = null;
    },
    onCancel: () => {
      grab.current = null;
    },
  });

  const onGridMove = (e: ReactPointerEvent<SVGPolygonElement>) => {
    if (placing || drawing) setHover(toCell(e.clientX, e.clientY, level));
  };
  const onGridClick = (e: MouseEvent<SVGPolygonElement>) => {
    const cell = toCell(e.clientX, e.clientY, level);
    if (placing) {
      // An inline type rides a run: on the floor it would have no port.
      if (symbolSchemas[placing]?.["x-inline"]) return;
      onPlace(placing, { kind: "cell", cell, rotation: 0 });
    } else if (drawing) {
      addPoint({ endpoint: { kind: "cell", cell }, cell });
    } else {
      onSelect(null);
    }
  };

  const preview = useMemo(() => {
    if (points.length === 0 || !hover) return null;
    const tail: RoutePoint = {
      endpoint: { kind: "cell", cell: hover },
      cell: hover,
    };
    const all = [...points, tail];
    const cells = [points[0].cell, ...routeWaypoints(all), hover];
    return cells.map((c) => axisCentre(projection, c));
  }, [points, hover, projection]);

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

  const gridLines: Pt[][] = [];
  for (let x = range.x0; x <= range.x1; x++) {
    gridLines.push([
      project(projection, x, range.y0),
      project(projection, x, range.y1),
    ]);
  }
  for (let y = range.y0; y <= range.y1; y++) {
    gridLines.push([
      project(projection, range.x0, y),
      project(projection, range.x1, y),
    ]);
  }
  const surface = [
    [range.x0, range.y0],
    [range.x1, range.y0],
    [range.x1, range.y1],
    [range.x0, range.y1],
  ]
    .map(([x, y]) => project(projection, x, y))
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  return (
    <SynopticRenderer
      doc={doc}
      extent={extent}
      touchAction="none"
      frameRef={frameRef}
    >
      <g data-editor-grid pointerEvents="none">
        {gridLines.map((line, i) => (
          <line
            key={i}
            x1={line[0].x}
            y1={line[0].y}
            x2={line[1].x}
            y2={line[1].y}
            strokeWidth={0.5}
            className="stroke-border"
          />
        ))}
      </g>
      {/* The plate's floor: a click here lands on a cell. */}
      <polygon
        data-editor-surface
        points={surface}
        fill="transparent"
        onPointerMove={onGridMove}
        onClick={onGridClick}
        style={{ cursor: placing || drawing ? "crosshair" : "default" }}
      />
      {/* Runs: a transparent stroke per piece, so a click names its cell. */}
      {runs.map(({ pipe, pieces, ends }) => {
        const selected = selection?.kind === "pipe" && selection.id === pipe.id;
        const error = errorIds.has(pipe.id);
        return (
          <g key={pipe.id} data-editor-pipe={pipe.id}>
            {(selected || error) &&
              pieces.map((piece, i) => (
                <polyline
                  key={i}
                  points={piece.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  strokeWidth={RUN_HIT_WIDTH}
                  strokeLinecap="round"
                  className={error ? "stroke-destructive/30" : "stroke-ring/30"}
                  pointerEvents="none"
                />
              ))}
            {pieces.map((piece, i) => (
              <polyline
                key={i}
                data-run-cell={cellKey(piece.cell)}
                points={piece.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="transparent"
                strokeWidth={RUN_HIT_WIDTH}
                strokeLinecap="round"
                style={{ cursor: "pointer" }}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (placing) {
                    const inline = symbolSchemas[placing]?.["x-inline"];
                    const onEnd = ends.some(
                      (c) => cellKey(c) === cellKey(piece.cell),
                    );
                    if (inline && onEnd) return;
                    onPlace(
                      placing,
                      inline
                        ? { kind: "pipe", pipe: pipe.id, cell: piece.cell }
                        : { kind: "cell", cell: piece.cell, rotation: 0 },
                    );
                  } else if (drawing) {
                    addPoint({
                      endpoint: {
                        kind: "pipe",
                        pipe: pipe.id,
                        cell: piece.cell,
                      },
                      cell: piece.cell,
                    });
                  } else {
                    onSelect({ kind: "pipe", id: pipe.id });
                  }
                }}
              />
            ))}
          </g>
        );
      })}
      {/* Bodies: a hit box each, dragged in select mode; ports on top,
          offered while a run is drawn. */}
      {[...symbols.values()].map((symbol) => {
        const box = symbolBox(projection, symbol);
        const selected =
          selection?.kind === "symbol" && selection.id === symbol.id;
        const error = errorIds.has(symbol.id);
        const free = symbol.placement.kind === "cell";
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
                style={{ cursor: free ? "move" : "pointer", ...move.style }}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect({ kind: "symbol", id: symbol.id });
                }}
                onPointerDown={(e) => {
                  if (!free) return;
                  const origin = symbol.placement.cell;
                  const z = origin.z ?? 0;
                  const at = toCell(e.clientX, e.clientY, z);
                  grab.current = {
                    id: symbol.id,
                    z,
                    offset: { x: at.x - origin.x, y: at.y - origin.y },
                  };
                  move.onPointerDown(e);
                }}
              />
            )}
            {drawing &&
              symbolPorts(projection, symbol).map(({ name, anchor, at }) => (
                <g
                  key={name}
                  data-editor-port={`${symbol.id}.${name}`}
                  style={{ cursor: "crosshair" }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    addPoint({
                      endpoint: { kind: "port", symbol: symbol.id, port: name },
                      cell: anchor.cell,
                      side: anchor.side,
                    });
                  }}
                >
                  <Port x={at.x} y={at.y} />
                  <title>{`${symbol.id}.${name}`}</title>
                </g>
              ))}
          </g>
        );
      })}
      {/* The cell under the pointer at the chosen level, and what a click
          would put there. */}
      {hover && (placing || drawing) && (
        <g pointerEvents="none" data-editor-hover={cellKey(hover)}>
          <polygon
            points={diamond(projection, hover)}
            fill="none"
            strokeWidth={1}
            className="stroke-ring"
          />
          {placing && (
            <g opacity={0.5}>
              <SynopticSymbol
                type={placing}
                projection={projection}
                origin={hover}
              />
            </g>
          )}
        </g>
      )}
      {preview && (
        <g pointerEvents="none" opacity={0.6} data-editor-preview>
          <Pipe points={preview} fluid={fluid} />
        </g>
      )}
    </SynopticRenderer>
  );
}
