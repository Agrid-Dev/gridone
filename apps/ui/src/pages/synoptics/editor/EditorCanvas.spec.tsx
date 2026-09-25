import { useRef, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type {
  Cell,
  GridoneClient,
  PipeElement,
  SymbolElement,
} from "@gridone/sdk";
import { axisCentre } from "@/components/synoptic/runs";
import { project } from "@/components/synoptic/projection";
import type {
  PlateDocument,
  PlateHandle,
} from "@/components/synoptic/SynopticRenderer";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { createI18nMock } from "@/test/i18nMock";
import { EditorCanvas } from "./EditorCanvas";
import { SYMBOL_DRAG_TYPE } from "./library";
import {
  useSynopticEditor,
  type SynopticEditorState,
} from "./useSynopticEditor";

const { toast } = vi.hoisted(() => ({
  toast: { error: vi.fn(), info: vi.fn() },
}));
vi.mock("react-i18next", () =>
  createI18nMock({
    "editor.canvas.dropOn": "Place on {{run}}",
    "fluids.dhw": "DHW",
  }),
);
vi.mock("sonner", () => ({ toast }));

/** How many screen px one plate px spans: the canvas reads it off the
 *  frame's matrix to keep the snap radius a screen distance. */
let zoom = 1;
/** jsdom lays nothing out: the plate's frame maps client points to
 *  themselves, at the zoom the test sets. */
Object.defineProperty(SVGElement.prototype, "getScreenCTM", {
  configurable: true,
  value: () => ({
    a: zoom,
    inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  }),
});
for (const method of ["setPointerCapture", "releasePointerCapture"]) {
  Object.defineProperty(SVGElement.prototype, method, {
    configurable: true,
    value: () => {},
  });
}
Object.defineProperty(SVGElement.prototype, "hasPointerCapture", {
  configurable: true,
  value: () => false,
});
vi.stubGlobal(
  "DOMPoint",
  class {
    constructor(
      public x: number,
      public y: number,
    ) {}
    matrixTransform() {
      return { x: this.x, y: this.y };
    }
  },
);

const at = (x: number, y: number, z = 0): Cell => ({ x, y, z });
const tank = (id: string, cell: Cell): SymbolElement => ({
  id,
  type: "tank",
  placement: { kind: "cell", cell, rotation: 0 },
  props: { capacity: "" },
  bindings: {},
});
/** A free run along y = 5 from x = 0 to 8, carrying a valve at (2,5). */
const lane: PipeElement = {
  id: "dhw-1",
  fluid: "dhw",
  from: { kind: "cell", cell: at(0, 5) },
  to: { kind: "cell", cell: at(8, 5) },
  waypoints: [],
  flow: null,
  tags: [],
};
const valve: SymbolElement = {
  id: "v",
  type: "valve_isolation",
  placement: { kind: "pipe", pipe: "dhw-1", cell: at(2, 5) },
  props: {},
  bindings: {},
};
const plate = (
  symbols: SymbolElement[],
  pipes: PipeElement[] = [],
): PlateDocument => ({
  version: 1,
  name: "p",
  description: null,
  projection: "isometric",
  symbols,
  pipes,
  labels: [],
});

let editor: SynopticEditorState;
function Harness({ initial }: { initial: PlateDocument }) {
  editor = useSynopticEditor(initial, null);
  const plateRef = useRef<PlateHandle | null>(null);
  return (
    <EditorCanvas editor={editor} plateRef={plateRef} onViewChange={() => {}} />
  );
}
function mount(initial: PlateDocument) {
  const client = { synoptics: {} } as unknown as GridoneClient;
  const wrap = (children: ReactNode) => (
    <GridoneClientProvider client={client}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </GridoneClientProvider>
  );
  return render(wrap(<Harness initial={initial} />));
}

/** Client coordinates of a cell's centre on the plan. */
const centre = (x: number, y: number) => {
  const p = project("flat", x + 0.5, y + 0.5);
  return { clientX: p.x, clientY: p.y };
};
const canvas = () => document.querySelector("[data-editor-canvas]")!;
const surface = () => document.querySelector("[data-editor-surface]")!;
const hit = (id: string) =>
  document.querySelector(
    `[data-editor-symbol='${id}'] rect[fill='transparent']`,
  )!;
const symbolOf = (id: string) => editor.doc.symbols!.find((s) => s.id === id);
/** The frame as cells: the surface spans it, 40 px a cell on the plan. */
const frame = () => {
  const n = (name: string) => Number(surface().getAttribute(name)) / 40;
  return { x0: n("x"), y0: n("y"), w: n("width"), h: n("height") };
};
/** A native drag event: jsdom has none, and testing-library's fallback
 *  drops the pointer position the canvas resolves the cell from. */
function dragEvent(
  target: Element,
  type: string,
  point: { clientX: number; clientY: number },
  data: Record<string, string> = {},
  relatedTarget: Element | null = null,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    relatedTarget,
    ...point,
  });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      dropEffect: "none",
      effectAllowed: "all",
      setData: (k: string, v: string) => {
        data[k] = v;
      },
      getData: (k: string) => data[k] ?? "",
    },
  });
  fireEvent(target, event);
}
/** Takes a library row in hand, as its dragstart does. */
function holding(type: string): Record<string, string> {
  act(() => editor.setDragType(type));
  return { [SYMBOL_DRAG_TYPE]: type };
}
function dragBody(id: string, from: Cell, path: Cell[]) {
  fireEvent.pointerDown(hit(id), {
    button: 0,
    pointerId: 1,
    ...centre(from.x, from.y),
  });
  for (const c of path) {
    fireEvent.pointerMove(window, { pointerId: 1, ...centre(c.x, c.y) });
  }
}
const release = (c: Cell) =>
  fireEvent.pointerUp(window, { pointerId: 1, ...centre(c.x, c.y) });

beforeEach(() => {
  zoom = 1;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EditorCanvas: a type dragged from the library", () => {
  it("shows the ghost on the cell under the pointer, places it there on drop, and selects it", () => {
    mount(plate([tank("b", at(10, 0))]));
    const data = holding("plate_exchanger");
    dragEvent(canvas(), "dragover", centre(4, 2), data);
    expect(
      document.querySelector("[data-editor-ghost='plate_exchanger']"),
    ).not.toBeNull();
    dragEvent(canvas(), "drop", centre(4, 2), data);
    expect(symbolOf("plate_exchanger-1")?.placement).toEqual({
      kind: "cell",
      cell: at(4, 2),
      rotation: 0,
    });
    expect(editor.selection).toEqual({
      kind: "symbol",
      id: "plate_exchanger-1",
    });
    expect(editor.dragType).toBeNull();
    expect(document.querySelector("[data-editor-hover]")).toBeNull();
  });

  it("accepts a drag over the plan only while a library type is in hand", () => {
    mount(plate([tank("b", at(10, 0))]));
    // A browser drops only where dragover was cancelled: a file or a text
    // dragged in from elsewhere must be turned away.
    const over = (data: Record<string, string>) => {
      const event = new MouseEvent("dragover", {
        bubbles: true,
        cancelable: true,
        ...centre(4, 2),
      });
      Object.defineProperty(event, "dataTransfer", {
        value: { dropEffect: "none", getData: (k: string) => data[k] ?? "" },
      });
      return fireEvent(canvas(), event);
    };
    expect(over({ "text/plain": "hello" })).toBe(true);
    const data = holding("plate_exchanger");
    expect(over(data)).toBe(false);
  });

  it("clears what it showed when the pointer leaves the canvas, not when it crosses a child", () => {
    mount(plate([tank("b", at(10, 0))]));
    const data = holding("plate_exchanger");
    dragEvent(canvas(), "dragover", centre(4, 2), data);
    dragEvent(canvas(), "dragleave", centre(4, 2), data, surface());
    expect(document.querySelector("[data-editor-ghost]")).not.toBeNull();
    dragEvent(canvas(), "dragleave", centre(4, 2), data, document.body);
    expect(document.querySelector("[data-editor-ghost]")).toBeNull();
  });

  it("says why a drop on a body is refused, and places nothing", () => {
    mount(plate([tank("b", at(10, 0))]));
    const data = holding("plate_exchanger");
    dragEvent(canvas(), "dragover", centre(10, 1), data);
    dragEvent(canvas(), "drop", centre(10, 1), data);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "editor.refused.overlap",
    );
    expect(editor.doc.symbols).toHaveLength(1);
  });

  it("snaps a valve onto the run it is dropped near, naming the run", () => {
    mount(plate([], [lane]));
    const data = holding("valve_isolation");
    const near = axisCentre("flat", at(4, 5));
    const point = { clientX: near.x + 4, clientY: near.y - 9 };
    dragEvent(canvas(), "dragover", point, data);
    expect(
      document.querySelector("[data-editor-ride='dhw-1:4,5,0']"),
    ).not.toBeNull();
    expect(
      document.querySelector("[data-editor-drop-label]")?.textContent,
    ).toBe("Place on DHW 1");
    dragEvent(canvas(), "drop", point, data);
    expect(symbolOf("valve_isolation-1")?.placement).toEqual({
      kind: "pipe",
      pipe: "dhw-1",
      cell: at(4, 5),
    });
  });

  it("drops a valve nowhere when no run is near", () => {
    mount(plate([], [lane]));
    const data = holding("valve_isolation");
    dragEvent(canvas(), "dragover", centre(4, 9), data);
    expect(document.querySelector("[data-editor-ride]")).toBeNull();
    dragEvent(canvas(), "drop", centre(4, 9), data);
    expect(editor.doc.symbols).toEqual([]);
    expect(editor.dragType).toBeNull();
  });

  it("keeps the snap a screen distance: zoomed in, the same plate distance is too far", () => {
    // 20 plate px below the centre of (4,5): within reach at 1:1, out of
    // it at 2:1, where those 20 px are 40 on screen.
    const near = axisCentre("flat", at(4, 5));
    const point = { clientX: near.x, clientY: near.y + 20 };
    mount(plate([], [lane]));
    let data = holding("valve_isolation");
    dragEvent(canvas(), "dragover", point, data);
    expect(document.querySelector("[data-editor-ride]")).not.toBeNull();
    cleanup();
    zoom = 2;
    mount(plate([], [lane]));
    data = holding("valve_isolation");
    dragEvent(canvas(), "dragover", point, data);
    expect(document.querySelector("[data-editor-ride]")).toBeNull();
  });
});

describe("EditorCanvas: an armed row clicked onto a run", () => {
  it("stands a free-standing type on the run's cell, at the floor", () => {
    mount(plate([], [lane]));
    act(() => editor.arm("plate_exchanger"));
    fireEvent.click(document.querySelector("[data-run-cell='5,5,0']")!);
    expect(symbolOf("plate_exchanger-1")?.placement).toEqual({
      kind: "cell",
      cell: at(5, 5),
      rotation: 0,
    });
  });
});

describe("EditorCanvas: an armed row clicked onto a raised run", () => {
  it("stands the symbol on the floor under it, never in the air", () => {
    // Up at x = 2, overhead to x = 6, down: the cells between are at z 1.
    const over: PipeElement = {
      ...lane,
      waypoints: [at(2, 5), at(2, 5, 1), at(6, 5, 1), at(6, 5)],
    };
    mount(plate([], [over]));
    act(() => editor.arm("plate_exchanger"));
    fireEvent.click(document.querySelector("[data-run-cell='4,5,1']")!);
    expect(symbolOf("plate_exchanger-1")?.placement.cell).toEqual(at(4, 5));
  });
});

describe("EditorCanvas: moving bodies", () => {
  it("selects what was just moved", () => {
    mount(plate([tank("a", at(0, 0)), tank("b", at(10, 0))]));
    act(() => editor.select({ kind: "symbol", id: "a" }));
    dragBody("b", at(10, 0), [at(12, 2)]);
    release(at(12, 2));
    expect(symbolOf("b")?.placement.cell).toEqual(at(12, 2));
    expect(editor.selection).toEqual({ kind: "symbol", id: "b" });
  });

  it("slides a valve along its run to the ride nearest the pointer, as one step", () => {
    mount(plate([valve], [lane]));
    // Grabbed on its cell, dragged along and a little off the run.
    const along = axisCentre("flat", at(6, 5));
    fireEvent.pointerDown(hit("v"), {
      button: 0,
      pointerId: 1,
      ...centre(2, 5),
    });
    fireEvent.pointerMove(window, { pointerId: 1, ...centre(4, 5) });
    fireEvent.pointerMove(window, {
      pointerId: 1,
      clientX: along.x + 6,
      clientY: along.y + 70,
    });
    release(at(6, 7));
    expect(symbolOf("v")?.placement).toEqual({
      kind: "pipe",
      pipe: "dhw-1",
      cell: at(6, 5),
    });
    expect(editor.doc.pipes![0]).toBe(lane);
    expect(editor.selection).toEqual({ kind: "symbol", id: "v" });
    act(() => editor.history.undo());
    expect(symbolOf("v")?.placement.cell).toEqual(at(2, 5));
  });

  it("never slides a valve onto the ends of its run", () => {
    mount(plate([valve], [lane]));
    fireEvent.pointerDown(hit("v"), {
      button: 0,
      pointerId: 1,
      ...centre(2, 5),
    });
    // Past the run's start, then past its end.
    fireEvent.pointerMove(window, { pointerId: 1, ...centre(-3, 5) });
    expect(symbolOf("v")?.placement.cell).toEqual(at(1, 5));
    fireEvent.pointerMove(window, { pointerId: 1, ...centre(12, 5) });
    release(at(12, 5));
    expect(symbolOf("v")?.placement.cell).toEqual(at(7, 5));
  });
});

describe("EditorCanvas: a move taken back", () => {
  it("puts the body back on Escape, the pointer still down, and leaves no step", () => {
    const initial = plate([tank("t", at(0, 0))]);
    mount(initial);
    dragBody("t", at(0, 0), [at(5, 3)]);
    expect(symbolOf("t")?.placement).toMatchObject({ cell: { x: 5, y: 3 } });
    fireEvent.keyDown(window, { key: "Escape" });
    // The release that follows moves nothing either.
    release(at(5, 3));
    expect(editor.doc).toBe(initial);
    expect(editor.history.canUndo).toBe(false);
  });
});

describe("EditorCanvas: the frame", () => {
  // A tank at the origin: the first frame is its content with room around
  // it, 24 x 18 cells from (-12,-8).
  it("grows past a body placed near its edge, and only then", () => {
    mount(plate([tank("a", at(0, 0))]));
    expect(frame()).toEqual({ x0: -12, y0: -8, w: 24, h: 18 });
    // In the middle: the frame stays.
    act(() => {
      editor.place("tank", { kind: "cell", cell: at(4, 0), rotation: 0 });
    });
    expect(frame()).toEqual({ x0: -12, y0: -8, w: 24, h: 18 });
    // Two cells from the right edge: it grows well past the body.
    act(() => {
      editor.place("plate_exchanger", {
        kind: "cell",
        cell: at(10, 0),
        rotation: 0,
      });
    });
    expect(frame()).toEqual({ x0: -12, y0: -8, w: 31, h: 18 });
  });

  it("does not shrink when what made it grow is removed", () => {
    mount(plate([tank("a", at(0, 0)), tank("far", at(30, 0))]));
    const grown = frame();
    act(() => editor.select({ kind: "symbol", id: "far" }));
    act(() => editor.remove());
    expect(frame()).toEqual(grown);
  });

  it("holds still while a body is dragged near its edge, and grows once it lands", () => {
    mount(plate([tank("a", at(0, 0))]));
    dragBody("a", at(0, 0), [at(5, 0), at(10, 0)]);
    expect(frame()).toEqual({ x0: -12, y0: -8, w: 24, h: 18 });
    release(at(10, 0));
    expect(frame()).toEqual({ x0: -12, y0: -8, w: 31, h: 18 });
  });
});

describe("EditorCanvas: ports in the pipe tool", () => {
  it("marks each port free, used by a run, or the start of the run being drawn", () => {
    const pac: SymbolElement = {
      id: "pac",
      type: "heat_pump",
      placement: { kind: "cell", cell: at(0, 0), rotation: 0 },
      props: {},
      bindings: {},
    };
    const fed: PipeElement = {
      ...lane,
      id: "in",
      from: { kind: "cell", cell: at(6, 0) },
      to: { kind: "port", symbol: "b", port: "primary_in" },
    };
    mount(plate([pac, tank("b", at(10, 0))], [fed]));
    const state = (port: string) =>
      document
        .querySelector(`[data-editor-port='${port}']`)
        ?.getAttribute("data-port-state");
    expect(state("pac.supply")).toBeUndefined();
    act(() => editor.setTool("pipe"));
    expect(state("pac.supply")).toBe("free");
    expect(state("b.primary_in")).toBe("used");
    expect(state("b.primary_out")).toBe("free");
    fireEvent.click(document.querySelector("[data-editor-port='pac.supply']")!);
    expect(state("pac.supply")).toBe("start");
    expect(state("pac.return")).toBe("free");
  });

  it("starts a branch on the run clicked, in its fluid", () => {
    const pac: SymbolElement = {
      id: "pac",
      type: "heat_pump",
      placement: { kind: "cell", cell: at(4, 8), rotation: 0 },
      props: {},
      bindings: {},
    };
    mount(plate([pac], [lane]));
    act(() => editor.setTool("pipe"));
    fireEvent.click(document.querySelector("[data-run-cell='3,5,0']")!);
    expect(editor.draw.points[0]?.endpoint).toEqual({
      kind: "pipe",
      pipe: "dhw-1",
      cell: at(3, 5),
    });
    // The pump's return faces -x at (4,9): clicking it ends the branch.
    fireEvent.click(document.querySelector("[data-editor-port='pac.return']")!);
    const branch = editor.doc.pipes!.find((p) => p.id !== "dhw-1")!;
    expect(branch.fluid).toBe("dhw");
    expect(branch.from).toEqual({
      kind: "pipe",
      pipe: "dhw-1",
      cell: at(3, 5),
    });
    expect(branch.to).toEqual({ kind: "port", symbol: "pac", port: "return" });
  });
});
