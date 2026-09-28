import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  GridoneError,
  type GridoneClient,
  type PipeElement,
  type SymbolElement,
  type Synoptic,
} from "@gridone/sdk";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { project } from "@/components/synoptic/projection";
import { symbolBox } from "@/components/synoptic/SynopticRenderer";
import { createI18nMock } from "@/test/i18nMock";
import { runViolations } from "./runRules";
import { SynopticCreate, SynopticEdit } from "./SynopticEditor";

const { DEVICE, toast } = vi.hoisted(() => ({
  DEVICE: {
    id: "dev-new",
    name: "PAC 01 new",
    type: "heat_pump",
    attributes: {
      onoff_state: {
        name: "onoff_state",
        data_type: "bool",
        current_value: true,
      },
      temperature: {
        name: "temperature",
        data_type: "float",
        current_value: 52.4,
      },
    },
  },
  toast: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Synoptics",
    "editor.untitled": "Untitled plate",
    "editor.name": "Name",
    "editor.tools.select": "Select",
    "editor.tools.pipe": "Pipe",
    "editor.label": "Label",
    "editor.rotation": "Rotation",
    "editor.collector.length": "Length",
    "editor.collector.removePort": "Remove",
    "editor.collector.portAttached": "A run is attached",
    "editor.collector.kinds.in": "inlet",
    "editor.collector.kinds.out": "outlet",
    "editor.undo": "Undo",
    "editor.redo": "Redo",
    "editor.inspector.delete": "Delete",
    "editor.device.label": "Device",
    "editor.pipeTool.overhead": "Overhead",
    "editor.create.title": "New synoptic",
    "editor.create.submit": "Create the view",
    "editor.create.duplicate": "Copy a view of the site",
    "editor.refused.overlap": "Another symbol already stands there.",
    "editor.checks.plate": "The view",
    "editor.checks.show": "Show",
    "view.plan": "Plan",
    "view.isometric": "Isometric",
    "common:common.save": "Save",
    "common:common.cancel": "Cancel",
    "editor.discard": "Discard the unsaved changes?",
    "common:errors.default": "Something went wrong",
  }),
);
vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => ({ devices: [DEVICE], loading: false, error: null }),
}));
vi.mock("@/hooks/useDeviceById", () => ({
  useDeviceById: (id?: string) => ({
    data: id === DEVICE.id ? DEVICE : undefined,
  }),
}));
vi.mock("@/hooks/useCanSeeConnectionStatus", () => ({
  useCanSeeConnectionStatus: () => false,
}));
vi.mock("sonner", () => ({ toast }));
// The 3D card and the preview draw a second plate; neither is under test
// here, and CI grants a spec only so much time.
vi.mock("./PreviewCard", () => ({ PreviewCard: () => null }));
vi.mock("./PreviewDialog", () => ({ PreviewDialog: () => null }));

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
/** The stored run from PAC 01's supply at (1,1) to b01's primary_in at
 *  (10,0), by (9,1) and (9,0). */
const FEED: PipeElement = {
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
};
const WITH_RUN: Synoptic = { ...SMALL, pipes: [FEED] };

/** jsdom lays nothing out: the plate's frame reads as the identity, so a
 *  pointer at a projected point lands on that cell. */
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
      list: vi.fn(async () => ({
        items: [
          {
            id: PLATE.id,
            name: PLATE.name,
            description: null,
            projection: "isometric",
            metadata: {},
          },
        ],
      })),
      get: vi.fn(async () => stored),
      create: vi.fn(async (doc: unknown) => ({ ...(doc as object), id: "p1" })),
      replace: vi.fn(async () => stored),
    },
  } as unknown as GridoneClient;
  render(
    <GridoneClientProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/synoptics" element={<p>index</p>} />
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
    get: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    replace: ReturnType<typeof vi.fn>;
  };
}

/** Client coordinates of a cell's centre on the plan. */
const at = (x: number, y: number) => {
  const p = project("flat", x + 0.5, y + 0.5);
  return { clientX: p.x, clientY: p.y };
};
const surface = () => document.querySelector("[data-editor-surface]")!;
const canvas = () => document.querySelector("[data-editor-canvas]")!;
const clickCell = (x: number, y: number) =>
  fireEvent.click(surface(), at(x, y));
const hit = (id: string) =>
  document.querySelector(
    `[data-editor-symbol='${id}'] rect[fill='transparent']`,
  )!;
const symbolOf = (body: { symbols: SymbolElement[] }, id: string) =>
  body.symbols.find((s) => s.id === id)!;
const save = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("detail");
};
const library = (name: string) =>
  within(
    screen.getByRole("complementary", { name: "editor.library.title" }),
  ).getByRole("button", { name });
/** A native drag event: jsdom has none, and testing-library's fallback
 *  drops the pointer position the canvas resolves the cell from. */
function drag(
  target: Element,
  type: string,
  point: { clientX: number; clientY: number },
  data: Record<string, string> = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
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

/** Submits the New dialog once its form reads valid. */
async function create(dialog: HTMLElement) {
  const submit = within(dialog).getByRole("button", {
    name: "Create the view",
  });
  await waitFor(() => expect(submit).toHaveProperty("disabled", false));
  fireEvent.click(submit);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

/** Fills the New dialog and starts the plate. */
async function startPlate(name: string, options: { plan?: boolean } = {}) {
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox"), {
    target: { value: name },
  });
  if (options.plan)
    fireEvent.click(within(dialog).getByRole("button", { name: /Plan/ }));
  await create(dialog);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SynopticEditor", () => {
  it("saves the stored plate back unchanged, guarded by the timestamp it read", async () => {
    const api = renderEditor("/synoptics/ouest/edit", PLATE);
    await screen.findByDisplayValue(PLATE.name);
    await save();
    // Mutant: an editor that saved the flat plan it draws would change the
    // view operators open on; one that drops labels, tags or defaults on
    // load sends less than the export; one without the guard sends no stamp.
    expect(api.replace).toHaveBeenCalledExactlyOnceWith(
      "ouest",
      EXPORT,
      UPDATED_AT,
    );
  });

  it("draws the plan whatever view the plate opens on", async () => {
    renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    const tank = SMALL.symbols!.find((s) => s.id === "b01")!;
    const box = symbolBox("flat", tank);
    // Mutant: drawing the stored projection puts the hit box on the
    // isometric diamond, where a click on the plan finds nothing.
    expect(Number(hit("b01").getAttribute("x"))).toBe(box.x0);
    expect(Number(hit("b01").getAttribute("y"))).toBe(box.y0);
  });

  it("starts a new plate from the New dialog and places a symbol from the library", async () => {
    const api = renderEditor("/synoptics/new");
    await startPlate("Cold production", { plan: true });
    expect(screen.getByDisplayValue("Cold production")).toBeTruthy();
    // A pump rides a pipe: armed and clicked on the floor, it lands nowhere.
    fireEvent.click(library("Pump"));
    clickCell(3, 2);
    expect(document.querySelector("[data-editor-symbol]")).toBeNull();
    fireEvent.click(library("Heat pump"));
    clickCell(3, 2);
    expect(
      document.querySelector("[data-editor-symbol='heat_pump-1']"),
    ).not.toBeNull();
    await save();
    const body = api.create.mock.calls[0][0];
    expect(body.name).toBe("Cold production");
    expect(body.projection).toBe("flat");
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

  it("starts a new plate as a copy of another, under its new name", async () => {
    const api = renderEditor("/synoptics/new", PLATE);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "ECS Ouest bis" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Copy a view of the site/ }),
    );
    fireEvent.click(within(dialog).getByRole("option", { name: PLATE.name }));
    await create(dialog);
    expect(api.get).toHaveBeenCalledWith("ouest");
    await save();
    const body = api.create.mock.calls[0][0];
    expect(body.name).toBe("ECS Ouest bis");
    expect(body.symbols).toEqual(PLATE.symbols);
    expect(body.pipes).toEqual(PLATE.pipes);
  });

  it("goes back to the index when the New dialog is cancelled", async () => {
    renderEditor("/synoptics/new");
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await screen.findByText("index");
  });

  it("places a symbol dropped from the library on the cell under the pointer", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    const data: Record<string, string> = {};
    drag(library("Plate exchanger"), "dragstart", at(0, 0), data);
    drag(canvas(), "dragover", at(4, 6), data);
    drag(canvas(), "drop", at(4, 6), data);
    await save();
    // Mutant: a drop that reads nothing from the pointer lands at 0,0.
    expect(
      symbolOf(api.replace.mock.calls[0][1], "plate_exchanger-1").placement,
    ).toEqual({
      kind: "cell",
      cell: { x: 4, y: 6, z: 0 },
      rotation: 0,
    });
  });

  it("puts an inline symbol strictly inside a run, never on its end cells", async () => {
    const api = renderEditor("/synoptics/ouest/edit", WITH_RUN);
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(library("Pump"));
    const run = (cell: string) =>
      document.querySelector(`[data-run-cell='${cell}']`)!;
    // Mutant: accepting the end cell stores a placement the backend refuses
    // as inline_on_endpoint.
    fireEvent.click(run("1,1,0"));
    expect(document.querySelector("[data-editor-symbol='pump-1']")).toBeNull();
    fireEvent.click(run("5,1,0"));
    expect(
      document.querySelector("[data-editor-symbol='pump-1']"),
    ).not.toBeNull();
    await save();
    expect(symbolOf(api.replace.mock.calls[0][1], "pump-1").placement).toEqual({
      kind: "pipe",
      pipe: "feed",
      cell: { x: 5, y: 1, z: 0 },
    });
  });

  it("snaps an inline symbol dropped near a run onto its nearest inside cell", async () => {
    const api = renderEditor("/synoptics/ouest/edit", WITH_RUN);
    await screen.findByDisplayValue(PLATE.name);
    const data: Record<string, string> = {};
    drag(library("Valve isolation"), "dragstart", at(0, 0), data);
    // A few px off the centre of (6,1), within the snap radius.
    const near = {
      clientX: at(6, 1).clientX + 5,
      clientY: at(6, 1).clientY + 9,
    };
    drag(canvas(), "dragover", near, data);
    expect(
      document.querySelector("[data-editor-ride='feed:6,1,0']"),
    ).not.toBeNull();
    drag(canvas(), "drop", near, data);
    await save();
    expect(
      symbolOf(api.replace.mock.calls[0][1], "valve_isolation-1").placement,
    ).toEqual({
      kind: "pipe",
      pipe: "feed",
      cell: { x: 6, y: 1, z: 0 },
    });
  });

  it("draws a run between two ports, leaving and entering through their faces", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(screen.getByRole("button", { name: /Pipe/ }));
    fireEvent.click(
      document.querySelector("[data-editor-port='pac-01.supply']")!,
    );
    fireEvent.click(
      document.querySelector("[data-editor-port='b01.primary_in']")!,
    );
    await save();
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
    // Mutant: a route ignoring the faces turns at (10,1) and enters from +y.
    expect(added.waypoints).toEqual([
      { x: 9, y: 1, z: 0 },
      { x: 9, y: 0, z: 0 },
    ]);
    expect(added.id).toBe(`${added.fluid}-1`);
  });

  it("draws the bends overhead when the pipe tool is set to", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(screen.getByRole("button", { name: /Pipe/ }));
    fireEvent.click(screen.getByRole("button", { name: "Overhead" }));
    fireEvent.click(
      document.querySelector("[data-editor-port='pac-01.supply']")!,
    );
    clickCell(5, 4);
    fireEvent.click(
      document.querySelector("[data-editor-port='b01.primary_in']")!,
    );
    await save();
    const [added] = api.replace.mock.calls[0][1].pipes;
    // Mutant: a bend clicked at the floor keeps the run on the floor.
    expect(added.waypoints.some((c: { z?: number }) => c.z === 1)).toBe(true);
    expect(runViolations(api.replace.mock.calls[0][1])).toEqual([]);
  });

  it("drops the run being drawn when an undo takes its start away", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(library("Heat pump"));
    clickCell(3, 5);
    fireEvent.click(screen.getByRole("button", { name: /Pipe/ }));
    fireEvent.click(
      document.querySelector("[data-editor-port='heat_pump-1.supply']")!,
    );
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(
      document.querySelector("[data-editor-symbol='heat_pump-1']"),
    ).toBeNull();
    // Mutant: keeping the point stores a run from a symbol that is gone,
    // refused at save as unknown_symbol.
    fireEvent.click(
      document.querySelector("[data-editor-port='b01.primary_in']")!,
    );
    await save();
    expect(api.replace.mock.calls[0][1].pipes).toEqual([]);
  });

  it("ignores a second click on the port a run just started from", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(screen.getByRole("button", { name: /Pipe/ }));
    const supply = () =>
      document.querySelector("[data-editor-port='pac-01.supply']")!;
    fireEvent.click(supply());
    fireEvent.click(supply());
    // Mutant: ending the run on the repeat stores a one-cell out-and-back.
    expect(document.querySelector("[data-editor-pipe]")).toBeNull();
    await save();
    expect(api.replace.mock.calls[0][1].pipes).toEqual([]);
  });

  it("leaves the plate alone while a key is pressed inside the panel", async () => {
    renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(hit("b01"));
    const capacity = await screen.findByLabelText("Capacity");
    fireEvent.keyDown(capacity, { key: "Backspace" });
    fireEvent.keyDown(capacity, { key: "r" });
    const rotation = screen.getByRole("group", { name: "Rotation" });
    fireEvent.keyDown(within(rotation).getByRole("button", { name: "0°" }), {
      key: "Delete",
    });
    expect(document.querySelector("[data-editor-symbol='b01']")).not.toBeNull();
    const pressed = () =>
      within(screen.getByRole("group", { name: "Rotation" }))
        .getAllByRole("button")
        .find((b) => b.getAttribute("aria-pressed") === "true")!.textContent;
    expect(pressed()).toBe("0°");
    // A reload shortcut is not a rotation.
    fireEvent.keyDown(window, { key: "r", metaKey: true });
    fireEvent.keyDown(window, { key: "r", ctrlKey: true });
    expect(pressed()).toBe("0°");
    fireEvent.keyDown(window, { key: "R" });
    expect(pressed()).toBe("90°");
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
    expect(
      document.querySelector(
        "[data-editor-symbol='pac-01'] rect.stroke-destructive",
      ),
    ).not.toBeNull();
    // The checks list them as well, the plate's own first, and lead to the
    // element each one is about.
    fireEvent.click(document.querySelector("[data-checks-pill]")!);
    const list = await waitFor(() => {
      const found = document.querySelector<HTMLElement>("[data-checks]");
      expect(found).not.toBeNull();
      return found!;
    });
    const [plate, symbol] = within(list).getAllByRole("listitem");
    expect(plate.textContent).toBe("The viewpipes: too many cells");
    expect(within(plate).queryByRole("button")).toBeNull();
    expect(symbol.textContent).toContain(
      "bindings.state: no device exposes onoff_state",
    );
    fireEvent.click(within(symbol).getByRole("button", { name: "Show" }));
    await screen.findByText("no device exposes onoff_state");
    expect(document.querySelector("[data-checks]")).toBeNull();
    expect(screen.getByText("bindings: fault is required")).toBeTruthy();
    // Editing the element forgets its errors: the halo and the messages go.
    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "PAC 01 bis" },
    });
    expect(screen.queryByText("no device exposes onoff_state")).toBeNull();
    expect(
      document.querySelector(
        "[data-editor-symbol='pac-01'] rect.stroke-destructive",
      ),
    ).toBeNull();
    // The document-level one is not the element's and stays.
    expect(screen.getByText("pipes: too many cells")).toBeTruthy();
  });

  it("makes a finished drag one step whose runs follow, and a cancelled one none", async () => {
    const api = renderEditor("/synoptics/ouest/edit", WITH_RUN);
    await screen.findByDisplayValue(PLATE.name);
    const undo = screen.getByRole("button", { name: "Undo" });
    fireEvent.pointerDown(hit("b01"), {
      button: 0,
      pointerId: 1,
      ...at(10, 0),
    });
    fireEvent.pointerMove(window, { pointerId: 1, ...at(12, 1) });
    fireEvent.pointerCancel(window, { pointerId: 1 });
    // Mutant: a cancel implemented as a move back leaves a step behind.
    expect(undo).toHaveProperty("disabled", true);
    fireEvent.pointerDown(hit("b01"), {
      button: 0,
      pointerId: 1,
      ...at(10, 0),
    });
    fireEvent.pointerMove(window, { pointerId: 1, ...at(11, 1) });
    fireEvent.pointerMove(window, { pointerId: 1, ...at(12, 2) });
    fireEvent.pointerMove(window, { pointerId: 1, ...at(13, 2) });
    fireEvent.pointerUp(window, { pointerId: 1, ...at(13, 2) });
    expect(undo).toHaveProperty("disabled", false);
    await save();
    const body = api.replace.mock.calls[0][1];
    expect(symbolOf(body, "b01").placement.cell).toEqual({ x: 13, y: 2, z: 0 });
    // Mutant: moving the tank alone leaves the run's bends behind, refused
    // at save as port_side_mismatch.
    expect(runViolations(body)).toEqual([]);
  });

  it("takes a whole drag back in one undo", async () => {
    const api = renderEditor("/synoptics/ouest/edit", WITH_RUN);
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.pointerDown(hit("b01"), {
      button: 0,
      pointerId: 1,
      ...at(10, 0),
    });
    fireEvent.pointerMove(window, { pointerId: 1, ...at(11, 2) });
    fireEvent.pointerMove(window, { pointerId: 1, ...at(13, 3) });
    fireEvent.pointerUp(window, { pointerId: 1, ...at(13, 3) });
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    await save();
    // Mutant: a step per cell crossed leaves the tank at (11,2).
    expect(api.replace.mock.calls[0][1].symbols).toEqual(WITH_RUN.symbols);
    expect(api.replace.mock.calls[0][1].pipes).toEqual(WITH_RUN.pipes);
  });

  it("keeps moving the symbol in flight when another button presses a second one", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
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
    await save();
    const body = api.replace.mock.calls[0][1];
    expect(symbolOf(body, "b01").placement.cell).toEqual({ x: 15, y: 5, z: 0 });
    const stored = PLATE.symbols!.find((s) => s.id === "pac-01")!.placement;
    expect(symbolOf(body, "pac-01").placement.cell).toEqual(stored.cell);
  });

  it("hands the gesture to a second finger on another symbol and puts the first back", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
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
    await save();
    const body = api.replace.mock.calls[0][1];
    // The first drag is discarded, not moved back: the tank is as stored.
    const stored = SMALL.symbols!.find((s) => s.id === "b01")!.placement;
    expect(symbolOf(body, "b01").placement.cell).toEqual(stored.cell);
    // Grabbed at its (1,1) cell, so the body follows one cell behind the finger.
    expect(symbolOf(body, "pac-01").placement.cell).toEqual({
      x: 3,
      y: 3,
      z: 0,
    });
  });

  it("refuses to put a body on another, and says why", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(library("Heat pump"));
    clickCell(10, 0);
    expect(toast.error).toHaveBeenCalledWith(
      "Another symbol already stands there.",
    );
    await save();
    expect(api.replace.mock.calls[0][1].symbols).toHaveLength(2);
  });

  it("undoes and redoes a deletion from the keyboard", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(hit("b01"));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(document.querySelector("[data-editor-symbol='b01']")).toBeNull();
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(document.querySelector("[data-editor-symbol='b01']")).not.toBeNull();
    fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });
    expect(document.querySelector("[data-editor-symbol='b01']")).toBeNull();
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    await save();
    expect(
      api.replace.mock.calls[0][1].symbols.map((s: SymbolElement) => s.id),
    ).toEqual(["pac-01"]);
  });

  it("copies the selected symbol beside it, without its device", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(hit("b01"));
    fireEvent.keyDown(window, { key: "d", metaKey: true });
    await save();
    const tank = symbolOf(api.replace.mock.calls[0][1], "b01");
    const copy = symbolOf(api.replace.mock.calls[0][1], "tank-1");
    expect(copy).toMatchObject({
      type: "tank",
      props: tank.props,
      device_id: null,
      bindings: {},
    });
  });

  it("binds a symbol to a device first, and moves its own readings with it", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(hit("pac-01"));
    const stored = PLATE.symbols!.find((s) => s.id === "pac-01")!;
    fireEvent.click(screen.getByRole("combobox", { name: "Device" }));
    fireEvent.click(await screen.findByRole("option", { name: /PAC 01 new/ }));
    await save();
    const pac = symbolOf(api.replace.mock.calls[0][1], "pac-01");
    expect(pac.device_id).toBe("dev-new");
    // Every binding that read the old device reads the new one.
    for (const [slot, value] of Object.entries(stored.bindings ?? {})) {
      expect(pac.bindings![slot]).toMatchObject({
        target: { devices: { ids: ["dev-new"] } },
      });
      expect(value.kind).toBe("attribute");
    }
  });

  it("offers no removal for a collector port a run is attached to", async () => {
    renderEditor("/synoptics/ouest/edit", PLATE);
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(hit("collector-supply"));
    const row = await waitFor(
      () => document.querySelector("[data-collector-port='in_1']")!,
    );
    // Mutant: the port goes, the run keeps naming it, and the save is
    // refused as unknown_port.
    expect(
      within(row as HTMLElement).queryByRole("button", { name: "Remove in_1" }),
    ).toBeNull();
    expect(
      within(row as HTMLElement).getByText("A run is attached"),
    ).toBeTruthy();
  });

  it("adds a collector port from a free slot of the diagram", async () => {
    const user = userEvent.setup();
    const api = renderEditor("/synoptics/ouest/edit", PLATE);
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(hit("collector-supply"));
    const slot = await waitFor(
      () => document.querySelector("[data-collector-slot]") as HTMLElement,
    );
    const [offset, side] = slot.getAttribute("data-collector-slot")!.split("|");
    await user.click(slot);
    await user.click(await screen.findByRole("menuitem", { name: "inlet" }));
    await save();
    const collector = symbolOf(
      api.replace.mock.calls[0][1],
      "collector-supply",
    );
    const stored = PLATE.symbols!.find((s) => s.id === "collector-supply")!
      .props as {
      ports: Record<string, unknown>;
    };
    const added = Object.keys((collector.props as typeof stored).ports).filter(
      (name) => !(name in stored.ports),
    );
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^in_\d+$/);
    expect(
      (collector.props as { ports: Record<string, unknown> }).ports[added[0]],
    ).toEqual({
      offset: Number(offset),
      side,
    });
  });

  it("keeps an integer field whole and an emptied text empty, the shapes the types accept", async () => {
    const api = renderEditor("/synoptics/ouest/edit", PLATE);
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(hit("collector-supply"));
    const length = await screen.findByLabelText("Length");
    fireEvent.change(length, { target: { value: "8.5" } });
    fireEvent.blur(length);
    fireEvent.click(hit("b01"));
    fireEvent.change(await screen.findByLabelText("Capacity"), {
      target: { value: "" },
    });
    await save();
    const body = api.replace.mock.calls[0][1];
    // Mutants: 8.5 in a strict integer, null in a required string, each
    // refused as a fieldless invalid_props.
    expect(
      (symbolOf(body, "collector-supply").props as { length: number }).length,
    ).toBe(8);
    expect(symbolOf(body, "b01").props).toEqual({ capacity: "" });
  });

  it("forgets a document-level violation once the name is edited", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    api.replace.mockRejectedValueOnce(
      new GridoneError(422, [
        { loc: ["body", "name"], msg: "too short", type: "string_too_short" },
      ]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("name: too short");
    fireEvent.change(screen.getByDisplayValue(PLATE.name), {
      target: { value: "Cold production" },
    });
    expect(screen.queryByText("name: too short")).toBeNull();
  });

  it("asks before leaving with unsaved work, and not otherwise", async () => {
    renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText("detail");
    expect(confirm).not.toHaveBeenCalled();
    cleanup();
    renderEditor("/synoptics/ouest/edit");
    await screen.findByDisplayValue(PLATE.name);
    fireEvent.click(hit("b01"));
    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByDisplayValue(PLATE.name)).toBeTruthy();
    confirm.mockReturnValue(true);
    // The way back in the bar asks the same.
    fireEvent.click(screen.getByRole("button", { name: /Synoptics/ }));
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
