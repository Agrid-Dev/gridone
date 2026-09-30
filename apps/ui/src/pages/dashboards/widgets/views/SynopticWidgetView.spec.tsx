import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
      <SynopticWidgetView
        config={{ type: "synoptic", synoptic_id: synopticId, projection }}
      />
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
  it("renders live readings with viewing controls only, even on device symbols", async () => {
    const { container, rerender, view } = renderView();
    expect(await screen.findByText("Heating plant")).toBeInTheDocument();
    expect(screen.getByText("21.5")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("plate1");
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")),
    ).toEqual(["view.zoomOut", "view.zoomIn", "view.fit"]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      container.querySelector("svg [role=button]"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Tank"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    temperature = "23.0";
    rerender(view("plate1"));
    expect(screen.getByText("23.0")).toBeInTheDocument();
  });

  it("loads the new document when the configured reference changes", async () => {
    const { rerender, view } = renderView();
    await screen.findByText("Heating plant");
    api.get.mockResolvedValue({ ...DOC, id: "plate2", name: "Cooling plant" });
    rerender(view("plate2"));
    expect(await screen.findByText("Cooling plant")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("plate2");
    expect(screen.queryByText("Heating plant")).not.toBeInTheDocument();
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
      await screen.findByText("Tank");
      expect(container.querySelector("[data-slab]") !== null).toBe(slab);
    },
  );

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
