import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { GridoneError, type Synoptic } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { symbolSlotKey } from "@/components/synoptic/values";
import { SynopticWidgetView } from "./SynopticWidgetView";

vi.mock("react-i18next", () => createI18nMock({}));

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({ synoptics: api }),
}));
let enabled = true;
vi.mock("@/utils/featureFlags", () => ({
  useFeatureEnabled: () => enabled,
}));
vi.mock("@/hooks/useDeviceById", () => ({
  useDeviceById: (id: string | undefined) => ({
    data: { id, name: id, type: "tank", attributes: {} },
    isLoading: false,
    error: null,
  }),
}));
vi.mock("@/hooks/useAttributeCommandRuntime", () => ({
  useAttributeWriter: () => vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => true,
}));
let temperature = "21.5";
vi.mock("@/hooks/useSynopticValues", () => ({
  useSynopticValues: () => ({
    devices: {},
    slots: {
      [symbolSlotKey("tank", "temperature")]: {
        text: temperature,
        raw: Number(temperature),
        unit: "°C",
        stale: false,
        faulty: false,
      },
    },
  }),
}));

const DOC: Synoptic = {
  id: "plate1",
  name: "Heating plant",
  metadata: {},
  symbols: [
    {
      id: "tank",
      type: "tank",
      label: "Tank",
      device_id: "device1",
      placement: { kind: "cell", cell: { x: 0, y: 0 } },
      bindings: {
        temperature: {
          kind: "attribute",
          target: { devices: { ids: ["device1"] }, attribute: "temperature" },
        },
      },
    },
  ],
};

function renderView(id = "plate1", projection?: "isometric" | "flat") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = (synopticId: string) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SynopticWidgetView
          config={{ type: "synoptic", synoptic_id: synopticId, projection }}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...render(view(id)), view };
}

beforeEach(() => {
  enabled = true;
  temperature = "21.5";
  api.get.mockReset().mockResolvedValue(DOC);
});
afterEach(cleanup);

describe("SynopticWidgetView", () => {
  it("renders live readings with the plate's toolbar", async () => {
    const { rerender, view } = renderView();
    expect(await screen.findByText("21.5")).toBeInTheDocument();
    // The widget's own title names the plate: the document's is not repeated.
    expect(screen.queryByText("Heating plant")).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("plate1");
    // "All controls from the synoptics toolbar are present."
    for (const name of [
      "nav.hide",
      "view.plan",
      "view.isometric",
      "view.zoomOut",
      "view.zoomIn",
      "view.fit",
      "view.legend",
      "view.exportPdf",
      "view.fullscreen",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    temperature = "23.0";
    rerender(view("plate1"));
    expect(screen.getByText("23.0")).toBeInTheDocument();
  });

  it("opens a device's points from its symbol, with the way to its page", async () => {
    const { container } = renderView();
    await screen.findByText("21.5");
    // "Control a device from synoptics and link to device."
    fireEvent.click(container.querySelector("[data-symbol='tank']")!);
    expect(
      document.querySelector("[data-device-popover='tank']"),
    ).toBeInTheDocument();
    expect(
      document.querySelector("a[href='/devices/device1']"),
    ).toBeInTheDocument();
  });

  it("leaves the plain wheel and vertical swipes to the page", async () => {
    const { container } = renderView();
    await screen.findByText("21.5");
    const svg = container.querySelector<SVGSVGElement>(
      "svg.bg-synoptic-plate",
    )!;
    // "No conflict with scroll: zoom with control buttons and trackpad
    // pinch, but not with scroll control."
    expect(fireEvent.wheel(svg, { deltaY: 100 })).toBe(true);
    expect(svg.style.touchAction).toBe("pan-y");
  });

  it("loads the new document when the configured reference changes", async () => {
    const { rerender, view } = renderView();
    await screen.findByText("21.5");
    api.get.mockResolvedValue({
      ...DOC,
      id: "plate2",
      symbols: [{ ...DOC.symbols![0], label: "Chiller" }],
    });
    rerender(view("plate2"));
    // Drawn on the plate and listed beside it.
    expect(await screen.findAllByText("Chiller")).toHaveLength(2);
    expect(api.get).toHaveBeenCalledWith("plate2");
    expect(screen.queryAllByText("Tank")).toEqual([]);
  });

  it.each([
    [404, "widgets.synoptic.notFound"],
    [500, "widgets.synoptic.error"],
  ])(
    "handles a %s locally without exposing the error",
    async (status, message) => {
      api.get.mockRejectedValue(new GridoneError(status, "internal details"));
      renderView();
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryByText("internal details")).not.toBeInTheDocument();
    },
  );

  it.each([
    // The isometric view stands the plate on a slab; the plan does not.
    ["isometric by default", undefined, true],
    ["flat when configured", "flat" as const, false],
  ])(
    "draws the plate %s, whatever the document says",
    async (_, projection, slab) => {
      api.get.mockResolvedValue({ ...DOC, projection: "flat" });
      const { container } = renderView("plate1", projection);
      await screen.findByText("21.5");
      expect(container.querySelector("[data-slab]") !== null).toBe(slab);
    },
  );

  it("opens on the configured view and lets the operator switch it", async () => {
    // "The view mode of the widget config becomes the default view but the
    // user can toggle."
    const { container } = renderView("plate1", "flat");
    await screen.findByText("21.5");
    const plan = screen.getByRole("button", { name: "view.plan" });
    expect(plan.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-slab]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "view.isometric" }));
    expect(container.querySelector("[data-slab]")).not.toBeNull();
  });

  it("does not request a document for an empty preview", () => {
    renderView("");
    expect(screen.getByText("widgets.synoptic.empty")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("does not request a document when synoptics are disabled", () => {
    enabled = false;
    renderView();
    expect(screen.getByText("widgets.synoptic.disabled")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});
