// What the editor's panels never let through, pinned on the whole page: a
// number the editor refused left standing in its field, a step that
// changes nothing, a raised run on a plate that opens flat, a flow without
// its reading.
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
import type { GridoneClient, Synoptic } from "@gridone/sdk";
import { project } from "@/components/synoptic/projection";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { createI18nMock } from "@/test/i18nMock";
import { runViolations } from "./runRules";
import { SynopticEdit } from "./SynopticEditor";

const { DEVICES, toast } = vi.hoisted(() => ({
  DEVICES: [
    ...["dev-a", "dev-b"].map((id) => ({
      id,
      name: `Pump ${id}`,
      type: "pump",
      attributes: {
        onoff_state: {
          name: "onoff_state",
          data_type: "bool",
          current_value: true,
        },
      },
    })),
    {
      id: "dev-c",
      name: "Pump dev-c",
      type: "pump",
      attributes: {
        speed: { name: "speed", data_type: "float", current_value: 40 },
      },
    },
  ],
  toast: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "editor.rotation": "Rotation",
    "editor.unsaved": "Unsaved changes",
    "editor.undo": "Undo",
    "editor.tools.pipe": "Pipe",
    "editor.collector.length": "Length",
    "editor.device.label": "Device",
    "editor.pipeInspector.flowAttribute": "Flow reading",
    "editor.pipeInspector.flowPick": "Pick a bool",
    "editor.pipeTool.overhead": "Overhead",
    "editor.settings.title": "View settings",
    "editor.settings.view": "Opens as",
    "editor.slot.format": "Unit and format",
    "editor.slot.decimals": "Decimals",
    "editor.refused.overlap": "Another symbol already stands there.",
    "view.plan": "Plan",
    "view.isometric": "Isometric",
    "common:common.save": "Save",
  }),
);
vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => ({ devices: DEVICES, loading: false, error: null }),
}));
vi.mock("@/hooks/useDeviceById", () => ({
  useDeviceById: (id?: string) => ({
    data: DEVICES.find((d) => d.id === id),
  }),
}));
vi.mock("@/hooks/useCanSeeConnectionStatus", () => ({
  useCanSeeConnectionStatus: () => false,
}));
vi.mock("sonner", () => ({ toast }));
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
const stored = (id: string) => PLATE.symbols!.find((s) => s.id === id)!;
/** PAC 01 and the tank b01, on the floor, isometric. */
const SMALL: Synoptic = {
  ...PLATE,
  symbols: [stored("pac-01"), stored("b01")],
  pipes: [],
  labels: [],
};
/** The same with a run from PAC 01's supply to b01's inlet. */
const WITH_RUN: Synoptic = {
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

Object.defineProperty(SVGElement.prototype, "getScreenCTM", {
  configurable: true,
  value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
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

function renderEditor(plate: Synoptic) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const client = {
    synoptics: {
      list: vi.fn(async () => ({ items: [] })),
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
  return client.synoptics as unknown as { replace: ReturnType<typeof vi.fn> };
}

const opened = () => screen.findByDisplayValue(PLATE.name);
const hit = (id: string) =>
  document.querySelector(
    `[data-editor-symbol='${id}'] rect[fill='transparent']`,
  )!;
const at = (x: number, y: number) => {
  const p = project("flat", x + 0.5, y + 0.5);
  return { clientX: p.x, clientY: p.y };
};
const save = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("detail");
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SynopticEditor: what the panels never let through", () => {
  it("shows the stored length again after a refused one, and says so once", async () => {
    // The bar would run into b01: refused once, and the field shows the
    // length the plate still has, so the blur after Enter commits nothing.
    renderEditor({
      ...SMALL,
      symbols: [
        {
          id: "col",
          type: "collector",
          placement: { kind: "cell", cell: { x: 0, y: 4 }, rotation: 0 },
          props: { axis: "x", length: 3, ports: {} },
          bindings: {},
        },
        {
          ...stored("b01"),
          placement: { kind: "cell", cell: { x: 4, y: 4 }, rotation: 0 },
        },
      ],
    });
    await opened();
    fireEvent.click(hit("col"));
    const length = await screen.findByLabelText("Length");
    fireEvent.change(length, { target: { value: "6" } });
    fireEvent.keyDown(length, { key: "Enter" });
    fireEvent.blur(length);
    expect(toast.error).toHaveBeenCalledOnce();
    expect(length).toHaveValue(3);
  });

  it("records nothing when the choice already made is clicked again", async () => {
    // Pressing the rotation already set is no change: no step, and the
    // plate still reads as saved.
    renderEditor(SMALL);
    await opened();
    fireEvent.click(hit("b01"));
    const rotation = screen.getByRole("group", { name: "Rotation" });
    fireEvent.click(within(rotation).getByRole("button", { name: "0°" }));
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    expect(screen.getByRole("button", { name: "Undo" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("never stores a raised run on a plate switched to the plan mid-run", async () => {
    // Bends clicked overhead come down to the floor when the plate turns
    // flat mid-run: the backend refuses any height there (flat_depth).
    const api = renderEditor(SMALL);
    await opened();
    fireEvent.click(screen.getByRole("button", { name: /Pipe/ }));
    fireEvent.click(screen.getByRole("button", { name: "Overhead" }));
    fireEvent.click(
      document.querySelector("[data-editor-port='pac-01.supply']")!,
    );
    fireEvent.click(document.querySelector("[data-editor-surface]")!, at(5, 4));
    fireEvent.click(screen.getByRole("button", { name: "View settings" }));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Opens as" })).getByRole(
        "button",
        { name: "Plan" },
      ),
    );
    fireEvent.click(
      document.querySelector("[data-editor-port='b01.primary_in']")!,
    );
    await save();
    expect(runViolations(api.replace.mock.calls[0][1])).toEqual([]);
  });

  it("moves a run's flow to another device that has the same reading", async () => {
    const user = userEvent.setup();
    const api = renderEditor(WITH_RUN);
    await opened();
    fireEvent.click(document.querySelector("[data-run-cell='5,1,0']")!);
    const device = () => screen.getByRole("combobox", { name: "Device" });
    await user.click(device());
    await user.click(await screen.findByRole("option", { name: /dev-a/ }));
    await user.click(screen.getByRole("combobox", { name: "Flow reading" }));
    await user.click(
      await screen.findByRole("option", { name: "Onoff State" }),
    );
    await user.click(device());
    await user.click(await screen.findByRole("option", { name: /dev-b/ }));
    expect(
      screen.getByRole("combobox", { name: "Flow reading" }).textContent,
    ).toContain("Onoff State");
    await save();
    expect(api.replace.mock.calls[0][1].pipes[0].flow).toEqual({
      kind: "attribute",
      target: { devices: { ids: ["dev-b"] }, attribute: "onoff_state" },
    });
  });

  it("takes a run's flow off for a device without its reading, and never saves one half set", async () => {
    const user = userEvent.setup();
    const api = renderEditor(WITH_RUN);
    await opened();
    fireEvent.click(document.querySelector("[data-run-cell='5,1,0']")!);
    const device = () => screen.getByRole("combobox", { name: "Device" });
    await user.click(device());
    await user.click(await screen.findByRole("option", { name: /dev-a/ }));
    // A device picked alone waits in the panel: the run holds no flow yet.
    expect(
      screen.getByRole("combobox", { name: "Flow reading" }).textContent,
    ).toContain("Pick a bool");
    await user.click(screen.getByRole("combobox", { name: "Flow reading" }));
    await user.click(
      await screen.findByRole("option", { name: "Onoff State" }),
    );
    await user.click(device());
    await user.click(await screen.findByRole("option", { name: /dev-c/ }));
    expect(
      screen.getByRole("combobox", { name: "Flow reading" }).textContent,
    ).toContain("Pick a bool");
    await save();
    // Not a flow without its reading, which the backend refuses.
    expect(api.replace.mock.calls[0][1].pipes[0].flow).toBeNull();
  });
});
