import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type {
  GridoneClient,
  AttributeTarget,
  PipeElement,
  SymbolElement,
  Synoptic,
} from "@gridone/sdk";
import { project } from "@/components/synoptic/projection";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { createI18nMock } from "@/test/i18nMock";
import { SynopticEdit } from "../SynopticEditor";

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
      fault: { name: "fault", data_type: "bool", current_value: false },
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
    "editor.label": "Label",
    "editor.slot.other": "Another device…",
    "editor.slot.pending": "Choose an attribute first",
    "slots.temperature": "Temperature",
    "editor.rotation": "Rotation",
    "editor.flow": "Flow",
    "editor.fluid": "Fluid",
    "editor.tools.select": "Select",
    "editor.tools.pipe": "Pipe",
    "editor.inspector.label": "Properties",
    "editor.inspector.duplicate": "Duplicate",
    "editor.inspector.delete": "Delete",
    "editor.inspector.show": "Show",
    "editor.inspector.readingsHint": "Pick the device first.",
    "editor.inspector.moveHint": "Drag the symbol on the plan to move it.",
    "editor.device.label": "Device",
    "editor.device.none": "No device",
    "editor.link.target": "Target view",
    "editor.link.none": "No view",
    "editor.link.open": "Open",
    "editor.guide.title": "Nothing selected",
    "editor.guide.empty": "Empty view",
    "editor.guide.bind.left": "{{count}} left to bind",
    "editor.guide.bind.hint": "Each symbol shows its device's readings.",
    "editor.pipeTool.title": "Draw a pipe",
    "editor.pipeTool.level": "Points to pass by",
    "editor.pipeTool.floor": "On the floor",
    "editor.pipeTool.overhead": "Overhead",
    "editor.pipeTool.pickStart": "Click a port to start.",
    "editor.pipeTool.from": "From · {{start}}",
    "editor.pipeTool.bends": "{{count}} bends",
    "editor.pipeTool.pickEnd": "End on a port.",
    "editor.pipeTool.finish": "Finish here",
    "editor.pipeTool.cancel": "Cancel the run",
    "editor.pipeInspector.riders": "On this pipe",
    "editor.pipeInspector.flowAttribute": "Flow reading",
    "editor.pipeInspector.teeOn": "Branch off {{run}}",
    "editor.pipeInspector.freeEnd": "Open end",
    "fluids.primary_supply": "primary supply",
    "fluids.primary_return": "primary return",
    "common:common.save": "Save",
    "common:common.cancel": "Cancel",
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
vi.mock("../PreviewCard", () => ({ PreviewCard: () => null }));
vi.mock("../PreviewDialog", () => ({ PreviewDialog: () => null }));
vi.mock("@/components/forms/targetPicker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/forms/targetPicker")>()),
  AttributeTargetPicker: ({
    onChange,
  }: {
    onChange: (target: Partial<AttributeTarget>) => void;
  }) => (
    <button onClick={() => onChange({ devices: { ids: ["other"] } })}>
      Select device only
    </button>
  ),
}));

const UPDATED_AT = "2026-09-17T12:00:00+00:00";
const PLATE: Synoptic = {
  ...JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        "../../../../../../../docs/specs/synoptic/ecs-ouest.json",
      ),
      "utf8",
    ),
  ),
  id: "ouest",
  metadata: { created_at: UPDATED_AT, updated_at: UPDATED_AT },
};
const stored = (id: string) => PLATE.symbols!.find((s) => s.id === id)!;
/** PAC 01 (bound to its device) and the tank b01 (bound to nothing). */
const SMALL: Synoptic = {
  ...PLATE,
  symbols: [stored("pac-01"), stored("b01")],
  pipes: [],
  labels: [],
};
/** PAC 01's supply to b01's inlet, by (9,1) and (9,0). */
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
const rider = (
  id: string,
  type: string,
  x: number,
  label: string,
): SymbolElement => ({
  id,
  type,
  label,
  placement: { kind: "pipe", pipe: "feed", cell: { x, y: 1, z: 0 } },
  device_id: null,
  props: {},
  bindings: {},
});
/** The run with a pump downstream of a valve, listed pump first. */
const RIDDEN: Synoptic = {
  ...SMALL,
  symbols: [
    ...SMALL.symbols!,
    rider("pump-1", "pump", 7, "P-01"),
    rider("valve-1", "valve_isolation", 3, "V-01"),
  ],
  pipes: [FEED],
};

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

function renderEditor(plate: Synoptic) {
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
      get: vi.fn(async () => plate),
      replace: vi.fn(async () => plate),
    },
  } as unknown as GridoneClient;
  render(
    <GridoneClientProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/synoptics/ouest/edit"]}>
          <Routes>
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
    replace: ReturnType<typeof vi.fn>;
  };
}

const opened = () => screen.findByDisplayValue(PLATE.name);
const panel = () => screen.getByRole("complementary", { name: "Properties" });
const hit = (id: string) =>
  document.querySelector(
    `[data-editor-symbol='${id}'] rect[fill='transparent']`,
  )!;
const runCell = (cell: string) =>
  document.querySelector(`[data-run-cell='${cell}']`)!;
const at = (x: number, y: number) => {
  const p = project("flat", x + 0.5, y + 0.5);
  return { clientX: p.x, clientY: p.y };
};
const step = (name: string) =>
  document.querySelector(`[data-guide-step='${name}']`)!;
const done = (name: string) => step(name).hasAttribute("data-done");
const save = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("detail");
};
const symbolOf = (body: { symbols: SymbolElement[] }, id: string) =>
  body.symbols.find((s) => s.id === id)!;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EditorGuide", () => {
  it("discards a binding draft on symbol change and never saves an incomplete replacement", async () => {
    const user = userEvent.setup();
    const boundTank: SymbolElement = {
      ...stored("b01"),
      device_id: DEVICE.id,
      bindings: {
        temperature: {
          kind: "attribute",
          target: { devices: { ids: [DEVICE.id] }, attribute: "temperature" },
        },
      },
    };
    const api = renderEditor({
      ...SMALL,
      symbols: [stored("pac-01"), boundTank],
    });
    await opened();
    const chooseOther = async () => {
      fireEvent.click(hit("b01"));
      await user.click(
        within(panel()).getByRole("combobox", { name: "Temperature" }),
      );
      await user.click(screen.getByRole("option", { name: "Another device…" }));
      fireEvent.click(
        screen.getByRole("button", { name: "Select device only" }),
      );
    };
    await chooseOther();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Choose an attribute first",
    );
    fireEvent.click(hit("pac-01"));
    fireEvent.click(hit("b01"));
    expect(screen.queryByRole("status")).toBeNull();
    await chooseOther();
    fireEvent.change(within(panel()).getByRole("textbox", { name: "Label" }), {
      target: { value: "Updated label" },
    });
    await save();
    const body = api.replace.mock.calls[0][1];
    expect(symbolOf(body, "b01").bindings).toEqual(boundTank.bindings);
    expect(symbolOf(body, "b01").label).toBe("Updated label");
  });
  it("ticks the steps a plate has reached, and counts what is left to bind", async () => {
    renderEditor(SMALL);
    await opened();
    expect(
      within(panel()).getByRole("heading", { name: "Nothing selected" }),
    ).toBeInTheDocument();
    expect(done("place")).toBe(true);
    // Mutant: a plate with no run reads as connected.
    expect(done("connect")).toBe(false);
    expect(done("onPipe")).toBe(false);
    expect(done("bind")).toBe(false);
    expect(step("bind").textContent).toContain("1 left to bind");
  });

  it("ticks every step once the plate has runs, riders and devices", async () => {
    const bound = (s: SymbolElement) => ({ ...s, device_id: DEVICE.id });
    renderEditor({
      ...RIDDEN,
      symbols: RIDDEN.symbols!.map((s) => (s.id === "pac-01" ? s : bound(s))),
    });
    await opened();
    expect(["place", "connect", "onPipe", "bind"].map((s) => done(s))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(step("bind").textContent).toContain(
      "Each symbol shows its device's readings.",
    );
  });

  it("calls an empty plate empty, with nothing bound yet", async () => {
    renderEditor({ ...SMALL, symbols: [] });
    await opened();
    expect(
      within(panel()).getByRole("heading", { name: "Empty view" }),
    ).toBeInTheDocument();
    // Mutant: nothing to bind reads as all bound on a plate with nothing.
    expect(done("bind")).toBe(false);
    expect(done("place")).toBe(false);
  });
});

describe("PipeToolPanel", () => {
  const level = () =>
    within(panel()).queryByRole("group", { name: "Points to pass by" });
  const finish = () =>
    within(panel()).getByRole("button", { name: /Finish here/ });
  const cancel = () =>
    within(panel()).getByRole("button", { name: /Cancel the run/ });

  it("offers the bends' height on a plate that opens isometric", async () => {
    renderEditor(SMALL);
    await opened();
    fireEvent.click(screen.getByRole("button", { name: /Pipe/ }));
    expect(level()).not.toBeNull();
  });

  it("offers no height on a plate that opens flat", async () => {
    renderEditor({ ...SMALL, projection: "flat" });
    await opened();
    fireEvent.click(screen.getByRole("button", { name: /Pipe/ }));
    expect(
      within(panel()).getByRole("heading", { name: "Draw a pipe" }),
    ).toBeInTheDocument();
    // The twin above finds the group with this query.
    expect(level()).toBeNull();
  });

  it("follows the run being drawn: finish needs two points, cancel one", async () => {
    const api = renderEditor(SMALL);
    await opened();
    fireEvent.click(screen.getByRole("button", { name: /Pipe/ }));
    expect(within(panel()).getByText("Click a port to start.")).toBeTruthy();
    expect(finish()).toHaveProperty("disabled", true);
    expect(cancel()).toHaveProperty("disabled", true);
    fireEvent.click(
      document.querySelector("[data-editor-port='pac-01.supply']")!,
    );
    expect(within(panel()).getByText("From · PAC 01")).toBeTruthy();
    // Mutant: a finish offered on the first point stores nothing and
    // loses the start.
    expect(finish()).toHaveProperty("disabled", true);
    expect(cancel()).toHaveProperty("disabled", false);
    fireEvent.click(document.querySelector("[data-editor-surface]")!, at(5, 4));
    expect(within(panel()).getByText("1 bends")).toBeTruthy();
    expect(finish()).toHaveProperty("disabled", false);
    fireEvent.click(finish());
    expect(within(panel()).getByText("Click a port to start.")).toBeTruthy();
    await save();
    const [run] = api.replace.mock.calls[0][1].pipes;
    expect(run.from).toEqual({
      kind: "port",
      symbol: "pac-01",
      port: "supply",
    });
    expect(run.to).toEqual({ kind: "cell", cell: { x: 5, y: 4, z: 0 } });
  });

  it("drops the run being drawn on cancel", async () => {
    renderEditor(SMALL);
    await opened();
    fireEvent.click(screen.getByRole("button", { name: /Pipe/ }));
    fireEvent.click(
      document.querySelector("[data-editor-port='pac-01.supply']")!,
    );
    fireEvent.click(cancel());
    expect(within(panel()).getByText("Click a port to start.")).toBeTruthy();
    expect(cancel()).toHaveProperty("disabled", true);
  });
});

describe("PipeInspector", () => {
  it("restores the bound flow device after undoing an unfinished device change", async () => {
    const user = userEvent.setup();
    const flow = {
      kind: "attribute" as const,
      target: { devices: { ids: ["dev-old"] }, attribute: "running" },
    };
    const api = renderEditor({ ...RIDDEN, pipes: [{ ...FEED, flow }] });
    await opened();
    fireEvent.click(runCell("5,1,0"));
    const device = () =>
      within(panel()).getByRole("combobox", { name: "Device" });
    const reading = () =>
      within(panel()).getByRole("combobox", { name: "Flow reading" });
    expect(device()).toHaveTextContent("dev-old");
    await user.click(device());
    await user.click(await screen.findByRole("option", { name: /PAC 01 new/ }));
    expect(device()).toHaveTextContent("PAC 01 new");
    expect(reading()).not.toHaveTextContent("running");

    fireEvent.click(screen.getByRole("button", { name: "editor.undo" }));
    expect(device()).toHaveTextContent("dev-old");
    expect(reading()).toHaveTextContent("running");
    fireEvent.click(screen.getByRole("button", { name: "editor.redo" }));
    expect(device()).toHaveTextContent("No device");
    fireEvent.click(screen.getByRole("button", { name: "editor.undo" }));
    await save();
    expect(api.replace.mock.calls[0][1].pipes[0].flow).toEqual(flow);
  });

  const riders = () =>
    within(within(panel()).getByRole("list", { name: "On this pipe" }))
      .getAllByRole("button")
      .map((b) => b.textContent);

  it("lists what rides the run in the order the fluid meets it", async () => {
    renderEditor(RIDDEN);
    await opened();
    fireEvent.click(runCell("5,1,0"));
    expect(
      within(panel()).getByRole("heading", { name: "feed" }),
    ).toBeInTheDocument();
    // Mutant: the plate's order lists the pump, met second, first.
    expect(riders()).toEqual(["V-01", "P-01"]);
  });

  it("leads from each end of the route to what it names, and back from a rider", async () => {
    renderEditor(RIDDEN);
    await opened();
    fireEvent.click(runCell("5,1,0"));
    fireEvent.click(within(panel()).getByRole("button", { name: "PAC 01" }));
    expect(within(panel()).getByRole("textbox", { name: "Label" })).toHaveValue(
      "PAC 01",
    );
    fireEvent.click(runCell("5,1,0"));
    fireEvent.click(within(panel()).getByRole("button", { name: "b01" }));
    expect(
      within(panel()).getByRole("textbox", { name: "Label" }),
    ).toHaveAttribute("placeholder", "b01");
    fireEvent.click(runCell("5,1,0"));
    fireEvent.click(within(panel()).getByRole("button", { name: "V-01" }));
    expect(within(panel()).getByRole("textbox", { name: "Label" })).toHaveValue(
      "V-01",
    );
    // A rider's panel leads back to its run.
    fireEvent.click(within(panel()).getByRole("button", { name: "Show" }));
    expect(
      within(panel()).getByRole("heading", { name: "feed" }),
    ).toBeInTheDocument();
  });

  it("reads the flow from a bool of the device picked, and nothing else", async () => {
    const user = userEvent.setup();
    const api = renderEditor(RIDDEN);
    await opened();
    fireEvent.click(runCell("5,1,0"));
    await user.click(within(panel()).getByRole("combobox", { name: "Device" }));
    await user.click(await screen.findByRole("option", { name: /PAC 01 new/ }));
    await user.click(
      within(panel()).getByRole("combobox", { name: "Flow reading" }),
    );
    // Mutant: offering the temperature stores a flow the backend refuses
    // as not a bool.
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Onoff State",
      "Fault",
    ]);
    await user.click(screen.getByRole("option", { name: "Onoff State" }));
    await save();
    expect(api.replace.mock.calls[0][1].pipes[0].flow).toEqual({
      kind: "attribute",
      target: { devices: { ids: ["dev-new"] }, attribute: "onoff_state" },
    });
  });
});

describe("SymbolInspector", () => {
  const duplicate = () =>
    within(panel()).queryByRole("button", { name: "Duplicate" });

  it("copies a symbol on the floor", async () => {
    renderEditor(RIDDEN);
    await opened();
    fireEvent.click(hit("b01"));
    expect(duplicate()).not.toBeNull();
  });

  it("offers no copy of a symbol riding a run", async () => {
    renderEditor(RIDDEN);
    await opened();
    fireEvent.click(hit("pump-1"));
    expect(within(panel()).getByRole("textbox", { name: "Label" })).toHaveValue(
      "P-01",
    );
    // The twin above finds the button with this query.
    expect(duplicate()).toBeNull();
  });

  it("asks for the device first while the symbol has none", async () => {
    renderEditor(SMALL);
    await opened();
    fireEvent.click(hit("b01"));
    expect(within(panel()).getByText("Pick the device first.")).toBeTruthy();
    expect(
      within(panel()).getByRole("combobox", { name: "Device" }),
    ).toBeInTheDocument();
    fireEvent.click(hit("pac-01"));
    expect(within(panel()).queryByText("Pick the device first.")).toBeNull();
  });

  it("turns a free symbol, and leaves a collector's bar to its own editor", async () => {
    const api = renderEditor({
      ...SMALL,
      symbols: [...SMALL.symbols!, stored("collector-supply")],
    });
    await opened();
    fireEvent.click(hit("b01"));
    const rotation = within(panel()).getByRole("group", { name: "Rotation" });
    fireEvent.click(within(rotation).getByRole("button", { name: "90°" }));
    fireEvent.click(hit("collector-supply"));
    // Mutant: a rotation on a collector is refused at save: its axis says
    // which way the bar runs.
    expect(
      within(panel()).queryByRole("group", { name: "Rotation" }),
    ).toBeNull();
    expect(
      within(panel()).getByText("Drag the symbol on the plan to move it."),
    ).toBeTruthy();
    await save();
    expect(
      symbolOf(api.replace.mock.calls[0][1], "b01").placement,
    ).toMatchObject({ rotation: 1 });
  });

  it("points a link at a view of the site, or at none", async () => {
    const api = renderEditor({
      ...SMALL,
      symbols: [...SMALL.symbols!, stored("link-efa")],
    });
    await opened();
    fireEvent.click(hit("link-efa"));
    expect(within(panel()).queryByRole("link", { name: /Open/ })).toBeNull();
    fireEvent.click(within(panel()).getByRole("option", { name: PLATE.name }));
    expect(within(panel()).getByRole("link", { name: /Open/ })).toHaveAttribute(
      "href",
      "/synoptics/ouest",
    );
    // A link has no device: its panel offers none.
    expect(
      within(panel()).queryByRole("combobox", { name: "Device" }),
    ).toBeNull();
    await save();
    expect(symbolOf(api.replace.mock.calls[0][1], "link-efa").props).toEqual({
      synoptic_id: "ouest",
      caption: null,
    });
  });

  it("points a link back at no view", async () => {
    const link = stored("link-efa");
    const api = renderEditor({
      ...SMALL,
      symbols: [
        ...SMALL.symbols!,
        { ...link, props: { ...link.props, synoptic_id: "ouest" } },
      ],
    });
    await opened();
    fireEvent.click(hit("link-efa"));
    fireEvent.click(within(panel()).getByRole("option", { name: "No view" }));
    await save();
    expect(symbolOf(api.replace.mock.calls[0][1], "link-efa").props).toEqual({
      synoptic_id: null,
      caption: null,
    });
  });
});
