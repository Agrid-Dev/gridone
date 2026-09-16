import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { viewsKey } from "@/hooks/useDeviceViews";
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
      list: vi.fn(),
      previewCommand: vi.fn(),
      confirmCommand: vi.fn(),
      listCommands: vi.fn(),
    },
    deviceViews: { list: vi.fn() },
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
// Stub the shadcn Select with a native <select> so jsdom can drive it without
// Radix's pointer-event quirks.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    disabled?: boolean;
    children: ReactNode;
  }) => (
    <select
      aria-label="Apply to"
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));
vi.mock("react-i18next", () =>
  createI18nMock(
    {
      "presentation.fallbackTitle": "Standard view",
      "presentation.fallbackBody": "Presentation unavailable",
      "presentation.loading": "Loading presentation",
      "presentation.allAttributes": "All attributes",
      "presentation.sending": "Sending",
      "presentation.increase": "Increase {{name}}",
      "presentation.decrease": "Decrease {{name}}",
      "presentation.range": "{{min}} to {{max}}",
      "presentation.unavailable": "Unavailable",
      "commandTarget.label": "Apply to",
      "commandTarget.thisDevice": "This device only",
      "groups.reviewDrafts": "Review {{count}} setpoints",
      "groups.draftTitle": "Draft setpoints",
      "groups.draftDescription": "Prepare your setpoints",
      "groups.clearDrafts": "Clear all",
      "groups.removeDraft": "Remove {{attribute}}",
      "groups.previewTitle": "Preview {{name}}",
      "groups.previewManyTitle": "Review setpoints",
      "groups.previewDescription": "Set {{attribute}} to {{value}}",
      "groups.members": "Member",
      "groups.before": "Before",
      "groups.after": "After",
      "groups.apply": "Apply to {{count}}",
      "groups.cancel": "Cancel",
      "groups.close": "Close results",
      "groups.sentToTarget": "Command sent to {{name}}",
      "groups.batchSummary":
        "Succeeded {{success}}, failed {{failed}}, pending {{pending}}",
      "commandTarget.availableGroups": "{{count}} groups available",
      "groups.deviceCount": "{{total}} {{type}}",
      "groups.equipmentCount": "{{count}} devices",
      "thermostat.name_plural": "thermostats",
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
    driver_id: "driver",
    tags: {},
    attributes: {
      power: {
        name: "power",
        data_type: "bool",
        current_value: true,
        read_write_modes: ["read", "write"],
      },
      setpoint: {
        name: "setpoint",
        data_type: "float",
        current_value: 21,
        unit: "°C",
        read_write_modes: ["read", "write"],
        write_constraints: { step: 0.5, minimum: 16, maximum: 30 },
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
function setup({ seedViews }: { seedViews?: unknown[] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Seeding the views makes group membership available on the first render,
  // so a test can assert the ABSENCE of the target bar without racing the
  // query that would have populated it.
  if (seedViews) queryClient.setQueryData(viewsKey, seedViews);
  const tree = () => (
    <StrictMode>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <DeviceLiveControl />
        </QueryClientProvider>
      </MemoryRouter>
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
  state.client.deviceViews.list.mockResolvedValue([]);
  state.client.devices.list.mockResolvedValue([]);
  state.client.devices.listCommands.mockResolvedValue({
    items: [],
    total_pages: 1,
  });
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

describe("choosing what a change applies to", () => {
  const groupView = (value: string, name: string) => ({
    id: value,
    name,
    description: null,
    group_by: [],
    filter: { tags: { group: [value] } },
  });
  const withSetpoint = {
    ...document,
    bindings: {
      power: { attribute: "power" },
      setpoint: { attribute: "setpoint" },
    },
    controls: {
      power: { kind: "toggle", binding: "power", label: { default: "Power" } },
      setpoint: {
        kind: "number",
        binding: "setpoint",
        label: { default: "Setpoint" },
      },
    },
    page: {
      kind: "stack",
      children: [{ kind: "control-panel", controls: ["power", "setpoint"] }],
    },
  };

  function inGroups(...names: [string, string][]) {
    state.device = {
      ...device("v1"),
      tags: { group: names.map(([value]) => value) },
    } as Device;
    state.client.deviceViews.list.mockResolvedValue(
      names.map(([value, name]) => groupView(value, name)),
    );
    state.client.devices.getPresentation.mockResolvedValue(
      available(withSetpoint),
    );
  }

  const target = () => screen.getByRole("combobox", { name: "Apply to" });

  it("offers this device and each of its groups, this device by default", async () => {
    inGroups(["g1", "Second floor rooms"], ["g2", "South facade"]);
    setup();
    const select = await screen.findByRole("combobox", { name: "Apply to" });
    expect(
      [...select.querySelectorAll("option")].map((o) => o.textContent),
    ).toEqual(["This device only", "Second floor rooms", "South facade"]);
    expect(select).toHaveValue("self");
    expect(screen.queryByText(/g1|g2/)).not.toBeInTheDocument();
  });

  it("hides the selector for a device that belongs to no group", async () => {
    setup();
    await screen.findByRole("switch", { name: "Power" });
    expect(
      screen.queryByRole("combobox", { name: "Apply to" }),
    ).not.toBeInTheDocument();
  });

  it("writes straight to this device while it is the target", async () => {
    inGroups(["g1", "Second floor rooms"]);
    setup();
    const power = await screen.findByRole("switch", { name: "Power" });
    act(() => power.click());
    expect(state.client.devices.sendCommand).toHaveBeenCalledWith("device", {
      attribute: "power",
      value: false,
      confirm: true,
    });
    expect(state.client.devices.previewCommand).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /^Review/ }),
    ).not.toBeInTheDocument();
  });

  it("stages setpoints for a group and previews them against that group alone", async () => {
    inGroups(["g1", "Second floor rooms"], ["g2", "South facade"]);
    state.client.devices.previewCommand.mockResolvedValue({
      token: "token",
      target: { tags: { group: ["g1"] }, driver_id: "driver" },
      attribute: "power",
      value: false,
      members: [
        {
          device_id: "device",
          name: "Room 201",
          current_value: true,
          eligible: true,
        },
        {
          device_id: "other",
          name: "Room 202",
          current_value: true,
          eligible: true,
        },
      ],
    });
    state.client.devices.confirmCommand.mockResolvedValue({
      batch_id: "sent",
      commands: [],
    });
    setup();
    await screen.findByRole("combobox", { name: "Apply to" });
    act(() => {
      fireEvent.change(target(), { target: { value: "g1" } });
    });
    const power = await screen.findByRole("switch", { name: "Power" });
    act(() => power.click());
    expect(state.client.devices.sendCommand).not.toHaveBeenCalled();

    const review = await screen.findByRole("button", {
      name: "Review 1 setpoints",
    });
    act(() => review.click());
    await waitFor(() =>
      expect(state.client.devices.previewCommand).toHaveBeenCalledWith({
        attribute: "power",
        value: false,
        target: { tags: { group: ["g1"] }, driver_id: "driver" },
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Preview Second floor rooms",
      }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("checkbox", { name: "Room 201" }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("checkbox", { name: "Room 202" }),
    ).toBeVisible();
    expect(screen.queryByText(/g1/)).not.toBeInTheDocument();

    act(() => {
      within(dialog).getByRole("button", { name: "Apply to 2" }).click();
    });
    await waitFor(() =>
      expect(state.client.devices.confirmCommand).toHaveBeenCalledWith({
        token: "token",
        device_ids: ["device", "other"],
      }),
    );
    expect(state.client.devices.sendCommand).not.toHaveBeenCalled();
  });

  it("drops the setpoints staged for a group when the target changes", async () => {
    inGroups(["g1", "Second floor rooms"], ["g2", "South facade"]);
    setup();
    await screen.findByRole("combobox", { name: "Apply to" });
    act(() => {
      fireEvent.change(target(), { target: { value: "g1" } });
    });
    const power = await screen.findByRole("switch", { name: "Power" });
    act(() => power.click());
    expect(
      await screen.findByRole("button", { name: "Review 1 setpoints" }),
    ).toBeVisible();
    act(() => {
      fireEvent.change(target(), { target: { value: "g2" } });
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /^Review/ }),
      ).not.toBeInTheDocument(),
    );
    expect(state.client.devices.previewCommand).not.toHaveBeenCalled();
    expect(state.client.devices.sendCommand).not.toHaveBeenCalled();
  });

  it("cancels a setpoint still waiting for its debounce when the target changes", async () => {
    vi.useFakeTimers();
    try {
      inGroups(["g1", "Second floor rooms"]);
      setup();
      await vi.waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Increase Setpoint" }),
        ).toBeEnabled(),
      );
      act(() => {
        screen.getByRole("button", { name: "Increase Setpoint" }).click();
      });
      // Numeric intentions are debounced: nothing has left yet.
      expect(state.client.devices.sendCommand).not.toHaveBeenCalled();
      act(() => {
        fireEvent.change(target(), { target: { value: "g1" } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(state.client.devices.sendCommand).not.toHaveBeenCalled();
      expect(state.client.devices.previewCommand).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("what the target bar tells you before you touch a control", () => {
  const groupView = (value: string, name: string) => ({
    id: value,
    name,
    description: null,
    group_by: [],
    filter: { tags: { group: [value] } },
  });

  function inGroups(...names: [string, string][]) {
    state.device = {
      ...device("v1"),
      tags: { group: names.map(([value]) => value) },
    } as Device;
    state.client.deviceViews.list.mockResolvedValue(
      names.map(([value, name]) => groupView(value, name)),
    );
  }

  it("says how many groups are on offer while this device is the target", async () => {
    inGroups(["g1", "Second floor rooms"], ["g2", "South facade"]);
    setup();
    expect(await screen.findByText("2 groups available")).toBeVisible();
  });

  it("names the reach of the targeted group in business vocabulary", async () => {
    inGroups(["g1", "Second floor rooms"]);
    state.client.devices.list.mockResolvedValue(
      ["a", "b", "c"].map((id) => ({ id, name: id, type: "thermostat" })),
    );
    setup();
    await screen.findByRole("combobox", { name: "Apply to" });
    act(() => {
      fireEvent.change(screen.getByRole("combobox", { name: "Apply to" }), {
        target: { value: "g1" },
      });
    });
    expect(await screen.findByText("3 thermostats")).toBeVisible();
    expect(state.client.devices.list).toHaveBeenCalledWith({
      tags: ["group:g1"],
    });
    expect(screen.queryByText(/groups available/)).not.toBeInTheDocument();
  });

  it("does not fetch a group's members while the device is the target", async () => {
    inGroups(["g1", "Second floor rooms"]);
    setup();
    await screen.findByRole("combobox", { name: "Apply to" });
    expect(state.client.devices.list).not.toHaveBeenCalled();
  });

  it("offers no target on a device the presentation engine does not drive", async () => {
    inGroups(["g1", "Second floor rooms"]);
    const views = [groupView("g1", "Second floor rooms")];
    // Control: with a presentation, these very groups do produce the bar.
    setup({ seedViews: views });
    expect(
      await screen.findByRole("combobox", { name: "Apply to" }),
    ).toBeVisible();
    cleanup();

    // Without one, the legacy control writes straight to this device, so a
    // target selector would promise a scope nothing honours.
    state.device = { ...state.device, presentation_ref: null } as Device;
    setup({ seedViews: views });
    expect(
      await screen.findByRole("button", { name: "Supervision" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Apply to" }),
    ).not.toBeInTheDocument();
  });
});
