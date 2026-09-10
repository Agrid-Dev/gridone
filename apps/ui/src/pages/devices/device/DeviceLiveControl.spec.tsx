import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GridoneError, type Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
const state = vi.hoisted(() => ({
  device: {} as Device,
  canWrite: true,
  view: "supervision",
  broken: false,
  client: {
    devices: {
      getPresentation: vi.fn(),
      getPresentationAsset: vi.fn(),
      sendCommand: vi.fn(),
      get: vi.fn(),
    },
  },
}));
vi.mock("@/hooks/useDevice", () => ({
  useDeviceFromRoute: () => state.device,
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => state.client,
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => state.canWrite,
}));
vi.mock("@/hooks/useDeviceDetails", () => ({
  useDeviceDetails: () => ({ draft: {}, feedback: {} }),
}));
vi.mock("@/hooks/useAttributeLabel", () => ({
  useAttributeLabel: () => (name: string) => name,
}));
vi.mock("../standard-devices/registry", () => ({
  getStandardDeviceEntry: () =>
    state.view === "none"
      ? undefined
      : {
          Supervision:
            state.view === "supervision"
              ? () => <button>Supervision</button>
              : undefined,
          Control: () => <button>Control</button>,
        },
}));
vi.mock("./DeviceAttributePanes", () => ({
  DeviceAttributePanes: ({ group }: { group?: string }) => {
    if (state.broken && group) throw new Error("render failed");
    return <p>Attributes {group ?? "all"}</p>;
  },
}));
vi.mock("react-i18next", () =>
  createI18nMock(
    {
      "presentation.fallbackTitle": "Standard view",
      "presentation.fallbackBody": "Presentation unavailable",
      "presentation.loading": "Loading presentation",
      "presentation.allAttributes": "All attributes",
      "presentation.sending": "Sending",
    },
    { language: "en" },
  ),
);
import DeviceLiveControl from "./DeviceLiveControl";
const document = {
  schema_version: 1,
  requires: ["layout/1", "controls/1"],
  assets: {},
  bindings: { power: { attribute: "power" } },
  controls: {
    power: { kind: "toggle", binding: "power", label: { default: "Power" } },
  },
  page: {
    kind: "stack",
    children: [
      { kind: "control-panel", controls: ["power"] },
      { kind: "attributes", group: "sensors" },
      {
        kind: "device-face",
        label: { default: "Face" },
        view_box: { width: 100, height: 100 },
        layers: [
          {
            kind: "button",
            box: { x: 0, y: 0, width: 100, height: 100 },
            label: { default: "Face power" },
            action: { control: "power", op: "toggle" },
          },
        ],
      },
    ],
  },
};
function device(revision?: string): Device {
  return {
    id: "device",
    type: "thermostat",
    attributes: {
      power: {
        name: "power",
        data_type: "bool",
        current_value: true,
        read_write_modes: ["read", "write"],
      },
    },
    presentation_ref: revision ? { revision } : null,
  } as unknown as Device;
}
function available(overrides = {}) {
  return {
    status: "available",
    revision: "v1",
    assets: {},
    document: { ...document, ...overrides },
  };
}
function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = () => (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <DeviceLiveControl />
      </QueryClientProvider>
    </StrictMode>
  );
  const result = render(tree());
  return { queryClient, rerender: () => result.rerender(tree()) };
}
beforeEach(() => {
  state.device = device("v1");
  state.canWrite = true;
  state.view = "supervision";
  state.broken = false;
  state.client.devices.getPresentation.mockResolvedValue(available());
  state.client.devices.get.mockImplementation(async () => state.device);
  state.client.devices.sendCommand.mockResolvedValue({ id: "cmd" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
describe("DeviceLiveControl presentation integration", () => {
  it.each(["supervision", "control", "none"])(
    "keeps the legacy %s path without presentation requests or extra wrappers",
    (view) => {
      state.device = device();
      state.view = view;
      setup();
      expect(screen.getByText("Attributes all")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Supervision" }) !== null,
      ).toBe(view === "supervision");
      expect(screen.queryByRole("button", { name: "Control" }) !== null).toBe(
        view === "control",
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.queryByText("All attributes")).not.toBeInTheDocument();
      expect(state.client.devices.getPresentation).not.toHaveBeenCalled();
      expect(state.client.devices.getPresentationAsset).not.toHaveBeenCalled();
    },
  );
  it("renders authored controls and a group slot ahead of the standard view, retaining all attributes", async () => {
    setup();
    expect(await screen.findByRole("switch", { name: "Power" })).toBeChecked();
    expect(screen.getByText("Attributes sensors")).toBeInTheDocument();
    expect(screen.getByText("Attributes all")).toBeInTheDocument();
    expect(screen.getByText("All attributes")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Supervision" }),
    ).not.toBeInTheDocument();
    expect(state.client.devices.getPresentation).toHaveBeenCalledTimes(1);
    expect(state.client.devices.getPresentation).toHaveBeenCalledWith(
      "device",
      { revision: "v1" },
    );
  });
  it.each([
    ["version", { schema_version: 2 }, "unsupported_version"],
    ["capability", { requires: ["future/1"] }, "unsupported_capability"],
    [
      "asset",
      { assets: { missing: { kind: "image", source: "assets/missing.png" } } },
      "asset_unavailable",
    ],
  ])(
    "falls back completely for an unsupported %s with a visible diagnostic",
    async (_, overrides, code) => {
      state.client.devices.getPresentation.mockResolvedValue(
        available(overrides),
      );
      state.client.devices.getPresentationAsset.mockRejectedValue(
        new Error("missing"),
      );
      setup();
      expect(await screen.findByText(code)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Supervision" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    },
  );
  it("renders server diagnostics without authored controls", async () => {
    state.client.devices.getPresentation.mockResolvedValue({
      status: "unavailable",
      revision: "v1",
      diagnostics: [{ code: "MISSING_ASSET", path: "/assets/a" }],
    });
    setup();
    expect(await screen.findByText("MISSING_ASSET")).toBeInTheDocument();
    expect(screen.getByText(/\/assets\/a/)).toBeInTheDocument();
  });
  it("catches a renderer failure inside the dedicated boundary", async () => {
    state.broken = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup();
    expect(await screen.findByText("render_error")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Supervision" }),
    ).toBeInTheDocument();
  });
  it("keeps writable driver attributes read-only for viewers", async () => {
    state.canWrite = false;
    setup();
    const power = await screen.findByRole("switch", { name: "Power" });
    expect(power).toBeDisabled();
    const face = screen.getByRole("button", { name: "Face power" });
    expect(face).toHaveAttribute("aria-disabled", "true");
    act(() => {
      power.click();
      face.click();
    });
    expect(state.client.devices.sendCommand).not.toHaveBeenCalled();
  });
  it.each(["unavailable", "removed"])(
    "preserves an in-flight command under StrictMode when the presentation becomes %s",
    async (transition) => {
      let finish!: () => void;
      state.client.devices.sendCommand.mockReturnValue(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      const { rerender } = setup();
      const power = await screen.findByRole("switch", { name: "Power" });
      act(() => power.click());
      expect(state.client.devices.sendCommand).toHaveBeenCalledTimes(1);
      state.device = device(transition === "removed" ? undefined : "v2");
      state.client.devices.getPresentation.mockResolvedValue({
        status: "unavailable",
        revision: "v2",
        diagnostics: [{ code: "unsupported_version" }],
      });
      rerender();
      const standard = await screen.findByRole("button", {
        name: "Supervision",
      });
      expect(standard).toBeDisabled();
      await act(async () => finish());
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Supervision" }),
        ).not.toBeDisabled(),
      );
      expect(state.client.devices.sendCommand).toHaveBeenCalledTimes(1);
      expect(state.client.devices.sendCommand).toHaveBeenCalledWith("device", {
        attribute: "power",
        value: false,
        confirm: true,
      });
      expect(state.client.devices.get).toHaveBeenCalledTimes(1);
    },
  );
  it("refreshes the device once on a revision conflict without retrying obsolete requests", async () => {
    state.client.devices.getPresentation.mockRejectedValue(
      new GridoneError(409, "stale"),
    );
    setup();
    expect(await screen.findByText("invalid_document")).toBeInTheDocument();
    expect(state.client.devices.get).toHaveBeenCalledTimes(1);
    expect(state.client.devices.getPresentation).toHaveBeenCalledTimes(1);
  });
});
