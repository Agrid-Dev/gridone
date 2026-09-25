import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import {
  GridoneError,
  type Cell,
  type GridoneClient,
  type PipeElement,
  type SymbolElement,
  type Synoptic,
} from "@gridone/sdk";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import { symbolPort } from "@/components/synoptic/symbols/ports";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { createI18nMock } from "@/test/i18nMock";
import type { RoutePoint } from "./document";
import { runViolations } from "./runRules";
import { describeError } from "./saveErrors";
import { useSynopticEditor } from "./useSynopticEditor";

const { toast } = vi.hoisted(() => ({
  toast: { error: vi.fn(), info: vi.fn() },
}));
vi.mock("react-i18next", () => createI18nMock({}));
vi.mock("sonner", () => ({ toast }));

const at = (x: number, y: number, z = 0): Cell => ({ x, y, z });
/** A 2 x 2 heat pump at the origin (supply on +x at (1,1)) and a tank ten
 *  cells right (primary_in on -x at (10,0)). */
const pac: SymbolElement = {
  id: "pac",
  type: "heat_pump",
  placement: { kind: "cell", cell: at(0, 0), rotation: 0 },
  props: {},
  bindings: {},
};
const tank: SymbolElement = {
  id: "b",
  type: "tank",
  placement: { kind: "cell", cell: at(10, 0), rotation: 0 },
  props: { capacity: "" },
  bindings: {},
};
/** A free run below the two, carrying a valve at (3,6). */
const lane: PipeElement = {
  id: "dhw-1",
  fluid: "dhw",
  from: { kind: "cell", cell: at(0, 6) },
  to: { kind: "cell", cell: at(8, 6) },
  waypoints: [],
  flow: null,
  tags: [],
};
const valve: SymbolElement = {
  id: "v",
  type: "valve_isolation",
  placement: { kind: "pipe", pipe: "dhw-1", cell: at(3, 6) },
  props: {},
  bindings: {},
};
const plate = (
  symbols: SymbolElement[] = [pac, tank],
  pipes: PipeElement[] = [],
  projection: PlateDocument["projection"] = "isometric",
): PlateDocument => ({
  version: 1,
  name: "p",
  description: null,
  projection,
  symbols,
  pipes,
  labels: [],
});
const stored = (doc: PlateDocument): Synoptic => ({
  ...doc,
  id: "s1",
  metadata: {
    created_at: "2026-09-17T12:00:00+00:00",
    updated_at: "2026-09-17T12:00:00+00:00",
  },
});

function editorOn(doc: PlateDocument, synoptic: Synoptic | null = null) {
  const client = {
    synoptics: {
      create: vi.fn(async (d: object) => ({ ...d, id: "new" })),
      replace: vi.fn(async (id: string, d: object) => ({ ...d, id })),
    },
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <GridoneClientProvider client={client as unknown as GridoneClient}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </GridoneClientProvider>
  );
  const view = renderHook(() => useSynopticEditor(doc, synoptic), {
    wrapper,
  });
  return { ...view, api: client.synoptics };
}
const portPoint = (symbol: SymbolElement, port: string): RoutePoint => {
  const anchor = symbolPort(
    symbol.type,
    symbol.placement.cell,
    symbol.placement.kind === "cell" ? (symbol.placement.rotation ?? 0) : 0,
    port,
  )!;
  return {
    endpoint: { kind: "port", symbol: symbol.id, port },
    cell: anchor.cell,
    side: anchor.side,
  };
};
const cellPoint = (cell: Cell): RoutePoint => ({
  endpoint: { kind: "cell", cell },
  cell,
});
const symbolOf = (doc: PlateDocument, id: string) =>
  doc.symbols!.find((s) => s.id === id);

afterEach(() => {
  vi.clearAllMocks();
});

describe("useSynopticEditor: placing", () => {
  it("selects what it placed and puts the library row down", () => {
    const { result } = editorOn(plate());
    act(() => result.current.arm("plate_exchanger"));
    let placed = false;
    act(() => {
      placed = result.current.place("plate_exchanger", {
        kind: "cell",
        cell: at(5, 3),
        rotation: 0,
      });
    });
    expect(placed).toBe(true);
    expect(result.current.selection).toEqual({
      kind: "symbol",
      id: "plate_exchanger-1",
    });
    expect(result.current.placing).toBeNull();
  });

  it("says why a place on a body is refused, and keeps the row armed for another try", () => {
    const { result } = editorOn(plate());
    const before = result.current.doc;
    act(() => result.current.arm("plate_exchanger"));
    act(() => {
      result.current.place("plate_exchanger", {
        kind: "cell",
        cell: at(1, 1),
        rotation: 0,
      });
    });
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "editor.refused.overlap",
    );
    expect(result.current.doc).toBe(before);
    expect(result.current.placing).toBe("plate_exchanger");
    expect(result.current.history.canUndo).toBe(false);
  });
});

describe("useSynopticEditor: edits refused as a whole", () => {
  it("refuses a turn onto a neighbour with a word, and leaves no step", () => {
    // The heat pump turned a quarter covers x -1..0, where a tank stands.
    const neighbour = {
      ...tank,
      placement: { ...tank.placement, cell: at(-1, 0) },
    };
    const { result } = editorOn(plate([pac, neighbour]));
    const before = result.current.doc;
    act(() => {
      result.current.rotate("pac");
    });
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "editor.refused.overlap",
    );
    expect(result.current.doc).toBe(before);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("refuses to take away a collector port a run hangs on, with the runs' word", () => {
    const collector: SymbolElement = {
      id: "c",
      type: "collector",
      placement: { kind: "cell", cell: at(0, 10), rotation: 0 },
      props: {
        axis: "x",
        length: 4,
        ports: { out_1: { offset: 2, side: "+y" } },
      },
      bindings: {},
    };
    const run: PipeElement = {
      ...lane,
      id: "run",
      from: { kind: "port", symbol: "c", port: "out_1" },
      to: { kind: "cell", cell: at(2, 14) },
    };
    const { result } = editorOn(plate([collector], [run]));
    let taken = true;
    act(() => {
      taken = result.current.changeSymbol("c", (s) => ({
        ...s,
        props: { axis: "x", length: 4, ports: {} },
      }));
    });
    expect(taken).toBe(false);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "editor.refused.unroutable",
    );
  });

  it("selects a copy, and says so when there is no room for one", () => {
    const { result } = editorOn(plate());
    act(() => result.current.duplicate("b"));
    expect(result.current.selection).toEqual({ kind: "symbol", id: "tank-1" });
    expect(symbolOf(result.current.doc, "tank-1")?.placement.cell).toEqual(
      at(12, 0),
    );
    // Eight tanks in a row to the right of the next one: nowhere left.
    const row = Array.from({ length: 8 }, (_, i) => ({
      ...tank,
      id: `row-${i}`,
      placement: { ...tank.placement, cell: at(22 + 2 * i, 20) },
    }));
    const full = editorOn(
      plate([
        { ...tank, placement: { ...tank.placement, cell: at(20, 20) } },
        ...row,
      ]),
    );
    act(() => full.result.current.duplicate("b"));
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "editor.refused.noRoom",
    );
    expect(full.result.current.history.canUndo).toBe(false);
  });
});

describe("useSynopticEditor: tools", () => {
  it("drops the selection, the run in progress and the armed row when the pipe tool is taken", () => {
    const { result } = editorOn(plate());
    act(() => result.current.select({ kind: "symbol", id: "b" }));
    act(() => result.current.arm("pump"));
    act(() => result.current.draw.addPoint(cellPoint(at(4, 4))));
    expect(result.current.draw.points).toHaveLength(1);
    act(() => result.current.setTool("pipe"));
    expect(result.current.selection).toBeNull();
    expect(result.current.placing).toBeNull();
    expect(result.current.draw.points).toEqual([]);
    act(() => result.current.select({ kind: "symbol", id: "b" }));
    act(() => result.current.setTool("select"));
    // Back to the select tool, what was picked stays picked.
    expect(result.current.selection).toEqual({ kind: "symbol", id: "b" });
  });

  it("hands the pointer back to the select tool when a row is armed, and forgets the run in progress", () => {
    const { result } = editorOn(plate());
    act(() => result.current.setTool("pipe"));
    act(() => result.current.draw.addPoint(cellPoint(at(4, 4))));
    act(() => result.current.arm("tank"));
    expect(result.current.tool).toBe("select");
    expect(result.current.draw.points).toEqual([]);
    act(() => result.current.setTool("pipe"));
    act(() => result.current.arm(null));
    expect(result.current.tool).toBe("pipe");
  });

  it("keeps the bends on the floor of a flat plate, whatever the tool was set to", () => {
    const flat = editorOn(plate(undefined, undefined, "flat"));
    act(() => flat.result.current.draw.setLevel(1));
    expect(flat.result.current.draw.level).toBe(0);
    const iso = editorOn(plate());
    act(() => iso.result.current.draw.setLevel(1));
    expect(iso.result.current.draw.level).toBe(1);
  });
});

describe("useSynopticEditor: drawing", () => {
  it("ends a run on a port, not on a cell, and ignores the same point twice", () => {
    const { result } = editorOn(plate());
    act(() => result.current.setTool("pipe"));
    act(() => result.current.draw.addPoint(portPoint(pac, "supply")));
    act(() => result.current.draw.addPoint(portPoint(pac, "supply")));
    expect(result.current.draw.points).toHaveLength(1);
    act(() => result.current.draw.addPoint(cellPoint(at(5, 4))));
    expect(result.current.draw.points).toHaveLength(2);
    expect(result.current.doc.pipes).toEqual([]);
    act(() => result.current.draw.addPoint(portPoint(tank, "primary_in")));
    expect(result.current.draw.points).toEqual([]);
    const [run] = result.current.doc.pipes!;
    expect(run.from).toEqual({ kind: "port", symbol: "pac", port: "supply" });
    expect(run.to).toEqual({ kind: "port", symbol: "b", port: "primary_in" });
    expect(runViolations(result.current.doc)).toEqual([]);
  });

  it("gives a branch its trunk's fluid, whatever the picker was turned to", () => {
    const { result } = editorOn(plate(undefined, [lane]));
    act(() => result.current.setTool("pipe"));
    act(() => result.current.draw.setFluid("heating_supply"));
    const onLane: RoutePoint = {
      endpoint: { kind: "pipe", pipe: "dhw-1", cell: at(5, 6) },
      cell: at(5, 6),
    };
    act(() => result.current.draw.addPoint(onLane));
    // The picker follows the trunk on the first point...
    expect(result.current.draw.fluid).toBe("dhw");
    // ...and the run keeps it even when the picker is turned after.
    act(() => result.current.draw.setFluid("heating_supply"));
    act(() => result.current.draw.addPoint(cellPoint(at(5, 9))));
    act(() => result.current.draw.finish());
    const added = result.current.doc.pipes!.find((p) => p.id !== "dhw-1")!;
    expect(added.fluid).toBe("dhw");
    expect(added.id).toBe("dhw-2");
    expect(added.from).toEqual(onLane.endpoint);
  });

  it("keeps a rejected route so its last point can be corrected and retried", () => {
    const { result } = editorOn(plate());
    const points = [
      cellPoint(at(0, 8)),
      cellPoint(at(3, 8)),
      cellPoint(at(0, 8)),
    ];
    act(() => result.current.setTool("pipe"));
    for (const point of points) {
      act(() => result.current.draw.addPoint(point));
    }
    act(() => result.current.draw.finish());
    expect(toast.error).toHaveBeenCalledWith("editor.refused.brokenRun");
    expect(result.current.doc.pipes).toEqual([]);
    expect(result.current.history.canUndo).toBe(false);
    expect(result.current.draw.points).toEqual(points);

    act(() => result.current.draw.undoPoint());
    act(() => result.current.draw.finish());
    expect(result.current.draw.points).toEqual([]);
    expect(result.current.doc.pipes).toHaveLength(1);
    expect(runViolations(result.current.doc)).toEqual([]);
  });

  it("keeps the starting point when finish is called before a route is ready", () => {
    const { result } = editorOn(plate());
    const start = cellPoint(at(0, 8));
    act(() => result.current.draw.addPoint(start));
    act(() => result.current.draw.finish());
    expect(result.current.draw.points).toEqual([start]);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("drops the run in progress when an undo takes away the run it tees from", () => {
    const { result } = editorOn(plate());
    act(() => result.current.setTool("pipe"));
    act(() => result.current.draw.addPoint(cellPoint(at(0, 8))));
    act(() => result.current.draw.addPoint(cellPoint(at(6, 8))));
    act(() => result.current.draw.finish());
    const [trunk] = result.current.doc.pipes!;
    act(() =>
      result.current.draw.addPoint({
        endpoint: { kind: "pipe", pipe: trunk.id, cell: at(3, 8) },
        cell: at(3, 8),
      }),
    );
    expect(result.current.draw.points).toHaveLength(1);
    act(() => result.current.history.undo());
    expect(result.current.doc.pipes).toEqual([]);
    expect(result.current.draw.points).toEqual([]);
  });
});

describe("useSynopticEditor: dragging", () => {
  it("makes a drag one step, its runs following, and one ended where it began none", () => {
    const feed: PipeElement = {
      ...lane,
      id: "feed",
      fluid: "primary_supply",
      from: { kind: "port", symbol: "pac", port: "supply" },
      to: { kind: "port", symbol: "b", port: "primary_in" },
      waypoints: [at(9, 1), at(9, 0)],
    };
    const { result } = editorOn(plate(undefined, [feed]));
    const start = result.current.doc;
    act(() => result.current.drag.to("b", at(12, 1)));
    expect(result.current.drag.active).toBe(true);
    act(() => result.current.drag.to("b", at(13, 3)));
    act(() => result.current.drag.end("b"));
    expect(result.current.drag.active).toBe(false);
    expect(symbolOf(result.current.doc, "b")?.placement.cell).toEqual(
      at(13, 3),
    );
    expect(runViolations(result.current.doc)).toEqual([]);
    act(() => result.current.history.undo());
    expect(result.current.doc).toBe(start);
    // A second drag that comes back to its start leaves nothing behind.
    act(() => result.current.drag.to("b", at(12, 1)));
    act(() => result.current.drag.to("b", at(10, 0)));
    act(() => result.current.drag.end("b"));
    expect(result.current.doc).toBe(start);
    expect(result.current.dirty).toBe(false);
    expect(result.current.history.canRedo).toBe(true);
  });

  it("holds a dragged body at the last cell it could take", () => {
    const { result } = editorOn(plate());
    act(() => result.current.drag.to("b", at(10, 4)));
    // (1,1) is under the heat pump: refused, the tank stays at (10,4).
    act(() => result.current.drag.to("b", at(1, 1)));
    act(() => result.current.drag.end("b"));
    expect(symbolOf(result.current.doc, "b")?.placement.cell).toEqual(
      at(10, 4),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("puts everything back on a cancelled drag, the redo steps included", () => {
    const { result } = editorOn(plate());
    const start = result.current.doc;
    act(() => {
      result.current.rotate("b");
    });
    act(() => result.current.history.undo());
    act(() => result.current.drag.to("b", at(12, 4)));
    act(() => result.current.drag.cancel());
    expect(result.current.doc).toBe(start);
    expect(result.current.drag.active).toBe(false);
    expect(result.current.history.canRedo).toBe(true);
  });

  it("slides a symbol along the run it rides as one step, the run untouched", () => {
    const { result } = editorOn(plate([pac, tank, valve], [lane]));
    act(() => result.current.drag.slide("v", at(4, 6)));
    act(() => result.current.drag.slide("v", at(6, 6)));
    act(() => result.current.drag.end("v"));
    expect(symbolOf(result.current.doc, "v")?.placement).toEqual({
      kind: "pipe",
      pipe: "dhw-1",
      cell: at(6, 6),
    });
    expect(result.current.doc.pipes![0]).toBe(lane);
    act(() => result.current.history.undo());
    expect(symbolOf(result.current.doc, "v")?.placement.cell).toEqual(at(3, 6));
  });

  it("forgets what the last save said about a symbol once it is moved", async () => {
    const doc = plate();
    const { result, api } = editorOn(doc, stored(doc));
    api.replace.mockRejectedValueOnce(
      new GridoneError(422, [
        {
          loc: ["symbols", 1, "bindings", "temperature"],
          msg: "no device",
          type: "unresolved_target",
        },
        { loc: ["symbols", 0, "props"], msg: "bad", type: "invalid_props" },
      ]),
    );
    await act(async () => {
      await result.current.save();
    });
    expect([...result.current.errorIds].sort()).toEqual(["b", "pac"]);
    act(() => result.current.drag.to("b", at(12, 4)));
    act(() => result.current.drag.end("b"));
    expect([...result.current.errorIds]).toEqual(["pac"]);
  });
});

describe("useSynopticEditor: the plate as a whole", () => {
  it("removes the selected symbol, keeps its runs as free ends, and drops the selection", () => {
    const feed: PipeElement = {
      ...lane,
      id: "feed",
      from: { kind: "port", symbol: "pac", port: "supply" },
      to: { kind: "port", symbol: "b", port: "primary_in" },
      waypoints: [at(9, 1), at(9, 0)],
    };
    const { result } = editorOn(plate(undefined, [feed]));
    act(() => result.current.select({ kind: "symbol", id: "b" }));
    act(() => result.current.remove());
    expect(result.current.selection).toBeNull();
    expect(symbolOf(result.current.doc, "b")).toBeUndefined();
    expect(result.current.doc.pipes![0].to).toEqual({
      kind: "cell",
      cell: at(10, 0),
    });
  });

  it("reads as unchanged once every edit is undone", () => {
    const { result } = editorOn(plate());
    act(() => {
      result.current.rotate("b");
    });
    expect(result.current.dirty).toBe(true);
    act(() => result.current.history.undo());
    expect(result.current.dirty).toBe(false);
  });

  it("starts over from a new plate with nothing to undo, save or show", async () => {
    const doc = plate();
    const { result, api } = editorOn(doc, stored(doc));
    api.replace.mockRejectedValueOnce(
      new GridoneError(422, [
        { loc: ["symbols", 0, "props"], msg: "bad", type: "invalid_props" },
      ]),
    );
    await act(async () => {
      await result.current.save();
    });
    act(() => {
      result.current.rotate("b");
    });
    act(() => result.current.select({ kind: "symbol", id: "b" }));
    const next = plate([tank]);
    act(() => result.current.start(next));
    expect(result.current.doc).toBe(next);
    expect(result.current.dirty).toBe(false);
    expect(result.current.history.canUndo).toBe(false);
    expect(result.current.selection).toBeNull();
    expect(result.current.errorIds.size).toBe(0);
  });
});

describe("useSynopticEditor: what it never lets through", () => {
  it("leaves no step for a drag dropped where it began, on a plate stored without heights", () => {
    // The committed plates leave `z` out; the canvas writes it back as 0.
    const bare: SymbolElement = {
      ...tank,
      placement: { kind: "cell", cell: { x: 10, y: 0 }, rotation: 0 },
    };
    const { result } = editorOn(plate([pac, bare]));
    act(() => result.current.drag.to("b", at(12, 1)));
    act(() => result.current.drag.to("b", at(10, 0)));
    act(() => result.current.drag.end("b"));
    expect(result.current.history.canUndo).toBe(false);
    expect(result.current.dirty).toBe(false);
  });

  it("reads as unchanged when edits bring the plate back to what was loaded", () => {
    const { result } = editorOn(plate());
    for (let turn = 0; turn < 4; turn++) {
      act(() => result.current.rotate("b"));
    }
    // Four steps taken, and a plate that says what it said.
    expect(result.current.history.canUndo).toBe(true);
    expect(result.current.dirty).toBe(false);
  });

  it("reads as unchanged after a label typed and cleared", () => {
    const { result } = editorOn(plate());
    act(() => result.current.typeLabel("b", "Ballon 1"));
    act(() => result.current.typeLabel("b", ""));
    act(() => result.current.history.settle());
    expect(result.current.history.canUndo).toBe(false);
    expect(result.current.dirty).toBe(false);
  });

  it("makes no step of an edit that changes nothing", () => {
    const { result } = editorOn(plate());
    act(() =>
      result.current.changeSymbol("b", (s) => ({
        ...s,
        props: { ...s.props },
      })),
    );
    act(() => result.current.setProjection("isometric"));
    expect(result.current.history.canUndo).toBe(false);
    expect(result.current.dirty).toBe(false);
  });

  it("draws from where a port stands now, after an undo moved it back", () => {
    const { result } = editorOn(plate());
    act(() => result.current.drag.to("pac", at(0, 3)));
    act(() => result.current.drag.end("pac"));
    act(() => result.current.setTool("pipe"));
    const moved: SymbolElement = {
      ...pac,
      placement: { kind: "cell", cell: at(0, 3), rotation: 0 },
    };
    act(() => result.current.draw.addPoint(portPoint(moved, "supply")));
    act(() => result.current.history.undo());
    // The supply is back at (1,1), and so is the run's start.
    expect(result.current.draw.points[0].cell).toMatchObject({ x: 1, y: 1 });
    act(() => result.current.draw.addPoint(portPoint(tank, "primary_in")));
    expect(result.current.doc.pipes).toHaveLength(1);
    expect(runViolations(result.current.doc)).toEqual([]);
  });

  it("refuses a run that would break a rule the backend holds it to, and says so", () => {
    const { result } = editorOn(plate());
    act(() => result.current.setTool("pipe"));
    act(() => result.current.draw.addPoint(portPoint(pac, "supply")));
    // The tank's inlet read four cells below where it stands: the run
    // would reach it askew.
    const astray = { ...portPoint(tank, "primary_in"), cell: at(10, 4) };
    act(() => result.current.draw.addPoint(astray));
    expect(result.current.doc.pipes ?? []).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith("editor.refused.brokenRun");
    expect(result.current.draw.points).toEqual([portPoint(pac, "supply")]);
    act(() => result.current.draw.addPoint(portPoint(tank, "primary_in")));
    expect(result.current.draw.points).toEqual([]);
    expect(result.current.doc.pipes).toHaveLength(1);
    expect(runViolations(result.current.doc)).toEqual([]);
  });

  it("brings the bends of a run in progress down when the plate turns flat", () => {
    const { result } = editorOn(plate());
    act(() => result.current.setTool("pipe"));
    act(() => result.current.draw.setLevel(1));
    act(() => result.current.draw.addPoint(portPoint(pac, "supply")));
    act(() => result.current.draw.addPoint(cellPoint(at(5, 4, 1))));
    act(() => result.current.setProjection("flat"));
    expect(result.current.draw.points.map((p) => p.cell.z ?? 0)).toEqual([
      0, 0,
    ]);
    act(() => result.current.draw.addPoint(portPoint(tank, "primary_in")));
    expect(result.current.doc.pipes).toHaveLength(1);
    expect(runViolations(result.current.doc)).toEqual([]);
  });

  it("makes no copy of a symbol riding a run, and blames no room for it", () => {
    const { result } = editorOn(plate([pac, tank, valve], [lane]));
    act(() => result.current.duplicate("v"));
    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.history.canUndo).toBe(false);
  });

  it("forgets what the last save said of the name once it is typed, and nothing else", async () => {
    const doc = plate();
    const { result, api } = editorOn(doc, stored(doc));
    api.replace.mockRejectedValueOnce(
      new GridoneError(422, [
        {
          loc: ["pipes"],
          msg: "too many cells",
          type: "polyline_budget_exceeded",
        },
        { loc: ["body", "name"], msg: "too short", type: "string_too_short" },
      ]),
    );
    await act(async () => {
      await result.current.save();
    });
    const said = () =>
      result.current.errors.document.map((e) => describeError(e));
    expect(said()).toEqual(["pipes: too many cells", "name: too short"]);
    act(() => result.current.typeName("A longer name"));
    expect(said()).toEqual(["pipes: too many cells"]);
  });
});
