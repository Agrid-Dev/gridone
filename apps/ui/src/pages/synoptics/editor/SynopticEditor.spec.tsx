import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  GridoneError,
  type GridoneClient,
  type SymbolElement,
  type Synoptic,
} from "@gridone/sdk";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { project } from "@/components/synoptic/projection";
import { createI18nMock } from "@/test/i18nMock";
import { SynopticCreate, SynopticEdit } from "./SynopticEditor";

vi.mock("react-i18next", () =>
  createI18nMock({
    "editor.untitled": "Untitled plate",
    "editor.modes.select": "Select",
    "editor.modes.draw": "Draw pipe",
    "editor.palette": "Symbols",
    "editor.label": "Label",
    "editor.rotation": "Rotation",
    "editor.collector.length": "Length",
    "editor.collector.removePort": "Remove",
    "editor.collector.portAttached": "A run is attached",
    "common:common.save": "Save",
    "common:common.cancel": "Cancel",
    "editor.discard": "Discard the unsaved changes?",
    "common:errors.default": "Something went wrong",
  }),
);

vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => ({ devices: [], loading: false, error: null }),
}));

const UPDATED_AT = "2026-09-17T12:00:00+00:00";
const PLATE: Synoptic = {
  ...JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        "../../../../../../docs/specs/synoptic/ecs-ouest.json",
      ),
      "utf8",
    ),
  ),
  id: "ouest",
  metadata: { created_at: UPDATED_AT, updated_at: UPDATED_AT },
};
/** What the export route serves: the plate without its envelope. */
const EXPORT: Partial<Synoptic> = { ...PLATE };
delete EXPORT.id;
delete EXPORT.metadata;

/** A heat pump and a tank ten cells apart: enough to draw between and
 *  cheap to render on every interaction. */
const SMALL: Synoptic = {
  ...PLATE,
  symbols: PLATE.symbols!.filter((s) => ["pac-01", "b01"].includes(s.id)),
  pipes: [],
  labels: [],
};

/** jsdom lays nothing out: the plate's frame reads as the identity, so a
 *  click at a projected point lands on that cell. */
Object.defineProperty(SVGElement.prototype, "getScreenCTM", {
  configurable: true,
  value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
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

function renderEditor(path: string, stored: Synoptic = SMALL) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const client = {
    synoptics: {
      list: vi.fn(async () => ({ items: [] })),
      get: vi.fn(async () => stored),
      create: vi.fn(async (doc: unknown) => ({
        ...(doc as object),
        id: "p1",
      })),
      replace: vi.fn(async () => stored),
    },
  } as unknown as GridoneClient;
  render(
    <GridoneClientProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/synoptics/new" element={<SynopticCreate />} />
            <Route
              path="/synoptics/:synopticId/edit"
              element={<SynopticEdit />}
            />
            <Route path="/synoptics/:synopticId" element={<p>detail</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </GridoneClientProvider>,
  );
  return client.synoptics as unknown as {
    create: ReturnType<typeof vi.fn>;
    replace: ReturnType<typeof vi.fn>;
  };
}

const surface = () => document.querySelector("[data-editor-surface]")!;
const clickCell = (x: number, y: number) => {
  // The surface reads the pointer in plate units; a cell centre at grade.
  const p = project("isometric", x + 0.5, y + 0.5);
  fireEvent.click(surface(), { clientX: p.x, clientY: p.y });
};

afterEach(cleanup);

describe("SynopticEditor", () => {
  it("saves the stored plate back unchanged, guarded by the timestamp it read", async () => {
    const api = renderEditor("/synoptics/ouest/edit", PLATE);
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    // Mutant: an editor that drops labels, tags or defaults on load would
    // send less than the export; one that forgets the guard sends no stamp.
    expect(api.replace).toHaveBeenCalledExactlyOnceWith(
      "ouest",
      EXPORT,
      UPDATED_AT,
    );
  });

  it("places a symbol from the palette at the clicked cell and creates the plate", async () => {
    const api = renderEditor("/synoptics/new");
    await screen.findByDisplayValue("Untitled plate");
    // An inline type has no port on the floor: the palette refuses it there.
    fireEvent.click(screen.getByRole("button", { name: "pump" }));
    clickCell(3, 2);
    expect(document.querySelector("[data-editor-symbol]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "heat pump" }));
    clickCell(3, 2);
    // The new symbol is selected and named after its type.
    expect(
      document.querySelector("[data-editor-symbol='heat_pump-1']"),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    expect(api.create).toHaveBeenCalledTimes(1);
    const body = api.create.mock.calls[0][0];
    // Mutant: a cell read at the wrong level or without flooring lands elsewhere.
    expect(body.symbols).toEqual([
      {
        id: "heat_pump-1",
        type: "heat_pump",
        placement: { kind: "cell", cell: { x: 3, y: 2, z: 0 }, rotation: 0 },
        props: {},
        bindings: {},
      },
    ]);
  });

  it("seeds a placed collector with the shape its form shows, so it saves as placed", async () => {
    const api = renderEditor("/synoptics/new");
    await screen.findByDisplayValue("Untitled plate");
    fireEvent.click(screen.getByRole("button", { name: "collector" }));
    clickCell(2, 2);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    // Mutant: props {} is refused as invalid_props while every field on
    // screen shows a valid value.
    expect(api.create.mock.calls[0][0].symbols[0].props).toEqual({
      axis: "x",
      length: 2,
      ports: {},
    });
  });

  it("keeps an integer field whole and an emptied text empty, the shapes the types accept", async () => {
    const api = renderEditor("/synoptics/ouest/edit", PLATE);
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(
      document.querySelector(
        "[data-editor-symbol='collector-supply'] rect[fill='transparent']",
      )!,
    );
    fireEvent.change(await screen.findByLabelText("Length"), {
      target: { value: "9.5" },
    });
    fireEvent.click(
      document.querySelector(
        "[data-editor-symbol='b01'] rect[fill='transparent']",
      )!,
    );
    fireEvent.change(await screen.findByLabelText("capacity"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    const symbols: SymbolElement[] = api.replace.mock.calls[0][1].symbols;
    // Mutants: 9.5 in a strict integer, null in a required string, each
    // refused as a fieldless invalid_props.
    expect(
      symbols.find((s) => s.id === "collector-supply")!.props!.length,
    ).toBe(9);
    expect(symbols.find((s) => s.id === "b01")!.props).toEqual({
      capacity: "",
    });
  });

  it("refuses to remove a collector port a run is attached to", async () => {
    const api = renderEditor("/synoptics/ouest/edit", PLATE);
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(
      document.querySelector(
        "[data-editor-symbol='collector-supply'] rect[fill='transparent']",
      )!,
    );
    const remove = await screen.findByRole("button", { name: "Remove in_1" });
    expect(remove).toHaveProperty("disabled", true);
    expect(remove.getAttribute("title")).toBe("A run is attached");
    fireEvent.click(remove);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    // Mutant: the port goes, the run keeps naming it, and the save is
    // refused as unknown_port.
    const collector = api.replace.mock.calls[0][1].symbols.find(
      (s: SymbolElement) => s.id === "collector-supply",
    );
    expect(Object.keys(collector.props.ports).sort()).toEqual([
      "in_1",
      "in_2",
      "out_1",
      "out_2",
    ]);
  });

  it("edits the scalar props a type declares, so a tank gets its capacity", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(
      document.querySelector(
        "[data-editor-symbol='b01'] rect[fill='transparent']",
      )!,
    );
    const capacity = await screen.findByLabelText("capacity");
    fireEvent.change(capacity, { target: { value: "1000 L" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    const [, tank] = api.replace.mock.calls[0][1].symbols;
    // Mutant: a props editor writing to the wrong key leaves capacity unset
    // and the backend refuses the tank as invalid_props.
    expect(tank.props).toEqual({ capacity: "1000 L" });
  });

  it("drops an inline symbol strictly inside a run, never on its end cells", async () => {
    // The stored run leaves pac-01's supply at (1,1) and reaches b01's
    // primary_in at (10,0) by (9,1) and (9,0).
    const withRun: Synoptic = {
      ...SMALL,
      pipes: [
        {
          id: "feed",
          fluid: "primary_supply",
          from: { kind: "port", symbol: "pac-01", port: "supply" },
          to: { kind: "port", symbol: "b01", port: "primary_in" },
          waypoints: [
            { x: 9, y: 1, z: 0 },
            { x: 9, y: 0, z: 0 },
          ],
          flow: null,
          tags: [],
        },
      ],
    };
    const api = renderEditor("/synoptics/ouest/edit", withRun);
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(screen.getByRole("button", { name: "pump" }));
    const run = (cell: string) =>
      document.querySelector(`[data-run-cell='${cell}']`)!;
    // Mutant: accepting the end cell stores a placement the backend
    // refuses as inline_on_endpoint, discovered only at save.
    fireEvent.click(run("1,1,0"));
    expect(document.querySelector("[data-editor-symbol='pump-1']")).toBeNull();
    fireEvent.click(run("5,1,0"));
    expect(
      document.querySelector("[data-editor-symbol='pump-1']"),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    const pump = api.replace.mock.calls[0][1].symbols.find(
      (s: SymbolElement) => s.id === "pump-1",
    );
    expect(pump.placement).toEqual({
      kind: "pipe",
      pipe: "feed",
      cell: { x: 5, y: 1, z: 0 },
    });
  });

  it("draws a run between two ports, leaving and entering through their faces", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(screen.getByRole("button", { name: "Draw pipe" }));
    // PAC 01's supply port (+x face of (1,1)) to b01's primary_in (-x of its cell).
    fireEvent.click(
      document.querySelector("[data-editor-port='pac-01.supply']")!,
    );
    fireEvent.click(
      document.querySelector("[data-editor-port='b01.primary_in']")!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    const [added] = api.replace.mock.calls[0][1].pipes;
    expect(added.from).toEqual({
      kind: "port",
      symbol: "pac-01",
      port: "supply",
    });
    expect(added.to).toEqual({
      kind: "port",
      symbol: "b01",
      port: "primary_in",
    });
    // The supply port is +x of (1,1) and primary_in is -x of (10,0): the
    // run leaves along +x, turns at (9,1) and enters from (9,0). Mutant: a
    // route ignoring the faces turns at (10,1) and enters from +y.
    expect(added.waypoints).toEqual([
      { x: 9, y: 1, z: 0 },
      { x: 9, y: 0, z: 0 },
    ]);
    expect(added.id).toBe(`${added.fluid}-1`);
  });

  it("drops the run being drawn when the symbol it started from is deleted", async () => {
    // The selection survives the switch to draw mode, so Delete still
    // removes the pump while a run leaves its port. Mutant: the run keeps
    // the port point and the next click stores a pipe from a symbol that
    // is gone, refused at save as unknown_symbol.
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(
      document.querySelector(
        "[data-editor-symbol='pac-01'] rect[fill='transparent']",
      )!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Draw pipe" }));
    fireEvent.click(
      document.querySelector("[data-editor-port='pac-01.supply']")!,
    );
    fireEvent.keyDown(window, { key: "Delete" });
    expect(document.querySelector("[data-editor-symbol='pac-01']")).toBeNull();
    fireEvent.click(
      document.querySelector("[data-editor-port='b01.primary_in']")!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    const body = api.replace.mock.calls[0][1];
    expect(body.pipes).toEqual([]);
    expect(body.symbols.map((s: SymbolElement) => s.id)).toEqual(["b01"]);
  });

  it("keeps the run being drawn through an edit that removes nothing", async () => {
    // Mutant: dropping the points on every document change loses the run
    // the moment the author touches the inspector.
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(
      document.querySelector(
        "[data-editor-symbol='pac-01'] rect[fill='transparent']",
      )!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Draw pipe" }));
    fireEvent.click(
      document.querySelector("[data-editor-port='pac-01.supply']")!,
    );
    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "PAC 01 bis" },
    });
    fireEvent.click(
      document.querySelector("[data-editor-port='b01.primary_in']")!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    expect(api.replace.mock.calls[0][1].pipes).toHaveLength(1);
  });

  it("ignores a second click on the port a run just started from", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(screen.getByRole("button", { name: "Draw pipe" }));
    const supply = () =>
      document.querySelector("[data-editor-port='pac-01.supply']")!;
    fireEvent.click(supply());
    fireEvent.click(supply());
    // Mutant: ending the run on the repeat stores a one-cell out-and-back.
    expect(document.querySelector("[data-editor-pipe]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    expect(api.replace.mock.calls[0][1].pipes).toEqual([]);
  });

  it("leaves the plate alone while a key is pressed inside the inspector", async () => {
    renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(
      document.querySelector(
        "[data-editor-symbol='b01'] rect[fill='transparent']",
      )!,
    );
    const capacity = await screen.findByLabelText("capacity");
    fireEvent.keyDown(capacity, { key: "Backspace" });
    fireEvent.keyDown(capacity, { key: "r" });
    // Mutant: a guard on the input tag alone still lets Delete through a
    // Radix select trigger, which is a button.
    fireEvent.keyDown(screen.getByLabelText("Rotation"), { key: "Delete" });
    expect(document.querySelector("[data-editor-symbol='b01']")).not.toBeNull();
    expect(screen.getByLabelText("Rotation").textContent).toContain("0°");
    // A reload shortcut is not a rotation. Mutant: reading the key alone
    // turns the tank on Cmd+R, Ctrl+R and Cmd+Shift+R, and the reload then
    // warns about an edit the author never made.
    fireEvent.keyDown(window, { key: "r", metaKey: true });
    fireEvent.keyDown(window, { key: "r", ctrlKey: true });
    fireEvent.keyDown(window, { key: "R", metaKey: true, shiftKey: true });
    expect(screen.getByLabelText("Rotation").textContent).toContain("0°");
    // On the plate the shortcut works with caps lock on as well.
    fireEvent.keyDown(window, { key: "R" });
    expect(screen.getByLabelText("Rotation").textContent).toContain("90°");
  });

  it("lands a save-time violation on the element it names", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    api.replace.mockRejectedValueOnce(
      new GridoneError(422, [
        {
          loc: ["symbols", 0, "bindings", "state"],
          msg: "no device exposes onoff_state",
          type: "unresolved_target",
        },
        // The shape of a required slot left unbound: on `bindings` itself.
        {
          loc: ["symbols", 0, "bindings"],
          msg: "fault is required",
          type: "missing_slot",
        },
        {
          loc: ["pipes"],
          msg: "too many cells",
          type: "polyline_budget_exceeded",
        },
      ]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("pipes: too many cells");
    // The symbol is marked on the canvas, and its message shows once selected.
    const marked = document.querySelector(
      "[data-editor-symbol='pac-01'] rect.stroke-destructive",
    );
    expect(marked).not.toBeNull();
    fireEvent.click(
      document.querySelector(
        "[data-editor-symbol='pac-01'] rect[fill='transparent']",
      )!,
    );
    await screen.findByText("no device exposes onoff_state");
    // Mutant: reading the slot name off a one-segment path gives undefined,
    // which no field claims, and the halo comes with no message.
    expect(screen.getByText("bindings: fault is required")).toBeTruthy();
    // Editing the element forgets its errors: the halo and the message go.
    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "PAC 01 bis" },
    });
    expect(screen.queryByText("no device exposes onoff_state")).toBeNull();
    expect(screen.queryByText("bindings: fault is required")).toBeNull();
    expect(
      document.querySelector(
        "[data-editor-symbol='pac-01'] rect.stroke-destructive",
      ),
    ).toBeNull();
    // The document-level one is not the element's and stays.
    expect(screen.getByText("pipes: too many cells")).toBeTruthy();
  });

  it("puts a symbol back where it was when the gesture moving it is cancelled", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    const hit = document.querySelector(
      "[data-editor-symbol='b01'] rect[fill='transparent']",
    )!;
    const at = (x: number, y: number) => {
      const p = project("isometric", x + 0.5, y + 0.5);
      return { clientX: p.x, clientY: p.y };
    };
    fireEvent.pointerDown(hit, { button: 0, pointerId: 1, ...at(10, 0) });
    fireEvent.pointerMove(window, { pointerId: 1, ...at(13, 2) });
    // Mutant: clearing the grab alone leaves the tank at (13,2).
    fireEvent.pointerCancel(window, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    const tank = api.replace.mock.calls[0][1].symbols.find(
      (s: SymbolElement) => s.id === "b01",
    );
    expect(tank.placement.cell).toEqual({ x: 10, y: 0, z: 0 });
  });

  it("keeps moving the symbol in flight when another button presses a second one", async () => {
    // A mouse keeps its pointer id: a right-press over the pump during a
    // drag of the tank is refused by the hook, so the tank stays the one
    // moving. Mutant: recording the grab before the hook relocates the
    // pump the author never dragged and leaves the tank where the press
    // interrupted it.
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    const hit = (id: string) =>
      document.querySelector(
        `[data-editor-symbol='${id}'] rect[fill='transparent']`,
      )!;
    const at = (x: number, y: number) => {
      const p = project("isometric", x + 0.5, y + 0.5);
      return { clientX: p.x, clientY: p.y };
    };
    fireEvent.pointerDown(hit("b01"), {
      button: 0,
      pointerId: 1,
      ...at(10, 0),
    });
    fireEvent.pointerMove(window, { pointerId: 1, ...at(13, 2) });
    fireEvent.pointerDown(hit("pac-01"), {
      button: 2,
      pointerId: 1,
      ...at(1, 1),
    });
    fireEvent.pointerMove(window, { pointerId: 1, ...at(15, 5) });
    fireEvent.pointerUp(window, { pointerId: 1, ...at(15, 5) });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    const cells = Object.fromEntries(
      api.replace.mock.calls[0][1].symbols.map((s: SymbolElement) => [
        s.id,
        s.placement.kind === "cell" ? s.placement.cell : null,
      ]),
    );
    expect(cells["b01"]).toEqual({ x: 15, y: 5, z: 0 });
    const stored = PLATE.symbols!.find((s) => s.id === "pac-01")!.placement;
    expect(cells["pac-01"]).toEqual(stored.kind === "cell" && stored.cell);
  });

  it("hands the gesture to a second finger on another symbol and puts the first back", async () => {
    // Mutant: recording the grab before the hook cancels the first drag
    // reverts the pump instead of the tank, leaves the tank at its partial
    // position and the second drag dead.
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    const hit = (id: string) =>
      document.querySelector(
        `[data-editor-symbol='${id}'] rect[fill='transparent']`,
      )!;
    const at = (x: number, y: number) => {
      const p = project("isometric", x + 0.5, y + 0.5);
      return { clientX: p.x, clientY: p.y };
    };
    fireEvent.pointerDown(hit("b01"), {
      button: 0,
      pointerId: 1,
      ...at(10, 0),
    });
    fireEvent.pointerMove(window, { pointerId: 1, ...at(13, 2) });
    fireEvent.pointerDown(hit("pac-01"), {
      button: 0,
      pointerId: 2,
      ...at(1, 1),
    });
    fireEvent.pointerMove(window, { pointerId: 2, ...at(4, 4) });
    fireEvent.pointerUp(window, { pointerId: 2, ...at(4, 4) });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("detail");
    const cells = Object.fromEntries(
      api.replace.mock.calls[0][1].symbols.map((s: SymbolElement) => [
        s.id,
        s.placement.kind === "cell" ? s.placement.cell : null,
      ]),
    );
    expect(cells["b01"]).toEqual({ x: 10, y: 0, z: 0 });
    // Grabbed at its (1,1) cell, so the body follows one cell behind the finger.
    expect(cells["pac-01"]).toEqual({ x: 3, y: 3, z: 0 });
  });

  it("forgets a document-level violation once the name is edited", async () => {
    const api = renderEditor("/synoptics/new");
    await screen.findByDisplayValue("Untitled plate");
    api.create.mockRejectedValueOnce(
      new GridoneError(422, [
        { loc: ["body", "name"], msg: "too short", type: "string_too_short" },
      ]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("name: too short");
    fireEvent.change(screen.getByDisplayValue("Untitled plate"), {
      target: { value: "Cold production" },
    });
    expect(screen.queryByText("name: too short")).toBeNull();
  });

  it("asks before Cancel throws away unsaved work, and not otherwise", async () => {
    renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    // Untouched: no question, straight back to the plate.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText("detail");
    expect(confirm).not.toHaveBeenCalled();
    cleanup();
    renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(
      document.querySelector(
        "[data-editor-symbol='b01'] rect[fill='transparent']",
      )!,
    );
    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Refused: the editor stays with its draft.
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByDisplayValue(PLATE.name)).toBeTruthy();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText("detail");
    confirm.mockRestore();
  });

  it("tells the author when the plate moved under them", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    api.replace.mockRejectedValueOnce(
      new GridoneError(409, "Synoptic 'ouest' changed since it was read"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("changed since"),
    );
  });
});
