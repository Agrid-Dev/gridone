import { createI18nMock } from "@/test/i18nMock";
import { BackLink } from "@/components/BackLink";
import { clearNavigation } from "@/lib/navigation";
import { useNavigationEntries } from "@/hooks/useNavigationEntries";
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
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Device } from "@gridone/sdk";
import NewCommandPage from "./NewCommandPage";

const mocks = vi.hoisted(() => ({
  devices: [] as Device[],
  assetsError: null as Error | null,
  listAttributes: vi.fn(),
  create: vi.fn(),
  dispatch: vi.fn(),
  listCommands: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ usePermissions: () => () => true }));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: {
      listAttributes: mocks.listAttributes,
      listCommands: mocks.listCommands,
      previewCommand: mocks.preview,
      confirmCommand: mocks.confirm,
      commandTemplates: { create: mocks.create, dispatch: mocks.dispatch },
    },
  }),
}));
vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => ({ devices: mocks.devices, loading: false }),
}));
vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => ({
    assetsList: [
      { id: "building", name: "Building", type: "building" },
      { id: "room", name: "Room", type: "room" },
      { id: "empty-room", name: "Empty room", type: "room" },
    ],
    assetTree: [
      {
        id: "building",
        name: "Building",
        type: "building",
        children: [
          { id: "room", name: "Room", type: "room", children: [] },
          { id: "empty-room", name: "Empty room", type: "room", children: [] },
        ],
      },
    ],
    isLoading: false,
    error: mocks.assetsError,
  }),
}));
vi.mock("@/components/forms/targetPicker/AttributeCoverageSelect", () => ({
  AttributeCoverageSelect: ({
    id,
    value,
    onChange,
    disabled,
  }: {
    disabled?: boolean;
    id: string;
    value: string;
    onChange: (value: string, type: string) => void;
  }) => (
    <select
      id={id}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value, "float")}
    >
      <option value="">Choose</option>
      <option value="setpoint">Setpoint</option>
      <option value="level">Level</option>
    </select>
  ),
}));
vi.mock("react-i18next", () =>
  createI18nMock({
    "groups.apply": "Apply to {{count}}",
    "groups.close": "Close results",
    "groups.cancel": "Cancel review",
    "commands.new.title": "Send a grouped command",
    "commands.attribute": "Attribute",
    "commands.value": "Value",
    "commands.new.dispatch": "Dispatch now",
    "commands.new.save.action": "Save as template",
    "commands.new.save.nameLabel": "Template name",
    "commands.new.targetMode.devices": "Devices",
    "commands.new.targetMode.filters": "Filters",
    "commands.new.toggleVisible": "Select all",
    "commands.grouped.scope": "Scope",
    "commands.grouped.who": "Which devices",
    "commands.grouped.what": "What to change",
    "commands.grouped.selectedDevices": "the selection",
    "commands.grouped.affectedCount":
      "{{count}} of {{total}} selected devices will receive the command",
    "commands.grouped.excluded": "{{count}} devices not concerned",
    "commands.grouped.readOnly": "Read-only attribute",
    "commands.grouped.absent": "Attribute absent",
    "commands.grouped.currentRange": "Currently {{range}} {{unit}}",
    "commands.grouped.detached": "This command no longer follows the filter.",
    "commands.grouped.confirmTitle": "Dispatch this grouped command?",
    "commands.grouped.confirmDescription":
      "Set {{attribute}} to {{value}} {{unit}} on {{count}} devices in {{scope}}.",
    "commands.grouped.dispatchResults": "Dispatch results",
    "commands.statusLabels.success": "Success",
    "commands.statusLabels.error": "Failed",
    "commands.statusLabels.pending": "Pending",
    "commands.grouped.vanished": "Device left the target",
    "commands.grouped.fullHistory": "View full command history",
    "commands.grouped.nameRequired": "Enter a template name.",
    "commands.grouped.bounds.maximum": "Will be refused above {{bound}}.",
    "common:common.cancel": "Cancel",
    "common.true": "True",
    "common.false": "False",
  }),
);

function device(
  id: string,
  value: number = 21,
  attributes?: Device["attributes"],
): Device {
  return {
    id,
    name: `Device ${id}`,
    type: "thermostat",
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    is_faulty: false,
    tags: { asset_id: ["room"] },
    attributes: attributes ?? {
      setpoint: {
        name: "setpoint",
        data_type: "float",
        read_write_modes: ["read", "write"],
        current_value: value,
        unit: "°C",
        write_constraints: { maximum: 25 },
        write_state: { status: "ready", constraints: { maximum: 25 } },
      },
      level: {
        name: "level",
        data_type: "float",
        read_write_modes: ["write"],
        current_value: 5,
      },
    },
  };
}
function previewMember(id: string, eligible = true) {
  return {
    device_id: id,
    name: `Device ${id}`,
    current_value: 21,
    eligible,
    reasons: eligible ? [] : [{ code: "not_writable" }],
  };
}
function unitCommand(id: string, status = "pending") {
  return {
    id: Number(id) || 1,
    device_id: id,
    batch_id: "batch",
    attribute: "setpoint",
    value: 23,
    data_type: "float",
    status,
    created_at: "2026-09-11T00:00:00Z",
  };
}
function NavigationFrame() {
  useNavigationEntries();
  return (
    <main id="main-content">
      <Outlet />
    </main>
  );
}
function mount(url: string | string[] = "/devices/commands/new") {
  const entries = Array.isArray(url) ? url : [url];
  const router = createMemoryRouter(
    [
      {
        element: <NavigationFrame />,
        children: [
          { path: "/devices/commands/new", element: <NewCommandPage /> },
          {
            path: "/devices/:deviceId",
            element: <BackLink to="/devices/commands/new">Back</BackLink>,
          },
          {
            path: "/devices/:deviceId/commands/new",
            element: <NewCommandPage />,
          },
          {
            path: "/assets/:assetId/commands/new",
            element: <NewCommandPage />,
          },
        ],
      },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 },
  );
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}
async function chooseAttribute(name = "setpoint") {
  fireEvent.change(await screen.findByLabelText("Attribute"), {
    target: { value: name },
  });
  await screen.findByLabelText(/Value/);
}

beforeEach(() => {
  clearNavigation();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.clearAllMocks();
  mocks.assetsError = null;
  mocks.devices = [device("1"), device("2")];
  mocks.listAttributes.mockResolvedValue({
    total_devices: 2,
    attributes: [
      {
        attribute: "setpoint",
        data_types: ["float"],
        device_count: 2,
        writable_count: 2,
        label: { default: "Setpoint" },
        unit: "°C",
        write_constraints: { maximum: 25 },
        write_state: { status: "ready", constraints: { maximum: 25 } },
      },
      {
        attribute: "level",
        data_types: ["float"],
        device_count: 2,
        writable_count: 2,
      },
    ],
  });
  mocks.create.mockResolvedValue({ id: "template" });
  mocks.dispatch.mockResolvedValue({
    batch_id: "batch",
    commands: [unitCommand("1"), unitCommand("2")],
  });
  mocks.preview.mockImplementation(async (request) => ({
    ...request,
    token: "token",
    members: (request.target.ids ?? ["1", "2"]).map((id: string) =>
      previewMember(id),
    ),
  }));
  mocks.confirm.mockResolvedValue({
    batch_id: "batch",
    commands: [unitCommand("1"), unitCommand("2")],
  });
  mocks.listCommands.mockResolvedValue({
    items: [unitCommand("1", "success"), unitCommand("2", "error")],
    total_pages: 1,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("grouped command page", () => {
  it("starts with devices visible and no implicit target, including attribute-only links", async () => {
    const { router } = mount(
      "/devices/commands/new?attribute=setpoint&value=23",
    );
    expect(
      screen.getByRole("checkbox", { name: "Device 1" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Device 2" }),
    ).not.toBeChecked();
    expect(screen.getByLabelText("Attribute")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dispatch now" })).toBeDisabled();
    expect(mocks.listAttributes).not.toHaveBeenCalled();
    expect(
      screen
        .getByText("Which devices")
        .compareDocumentPosition(screen.getByText("What to change")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("checkbox", { name: "Device 1" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Dispatch now" }),
      ).toBeEnabled(),
    );
    expect(mocks.listAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["1"] }),
    );
    await chooseAttribute("level");
    expect(new URLSearchParams(router.state.location.search).get("ids")).toBe(
      "1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Dispatch now" }));
    await waitFor(() =>
      expect(mocks.preview).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { ids: ["1"] },
          attribute: "level",
          value: 5,
        }),
      ),
    );
  });

  it("requires filter criteria before selecting a group", async () => {
    mount("/devices/commands/new?mode=filters");
    expect(
      screen.queryByRole("checkbox", { name: "Device 1" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Attribute")).toBeDisabled();
    expect(mocks.listAttributes).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /thermostat/i }));
    expect(
      await screen.findByRole("checkbox", { name: "Device 1" }),
    ).toBeChecked();
    await chooseAttribute();
    expect(screen.getByRole("checkbox", { name: "Device 2" })).toBeChecked();
  });

  it("combines zone and type filters without selecting other equipment with the same attribute", async () => {
    mocks.devices.push(
      { ...device("boiler"), type: "other" },
      { ...device("outside"), tags: {} },
    );
    const { router } = mount(
      "/devices/commands/new?mode=filters&scope=building&types=thermostat",
    );
    expect(screen.getByRole("checkbox", { name: "Device 1" })).toBeChecked();
    expect(
      screen.queryByRole("checkbox", { name: "Device boiler" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Device outside" }),
    ).not.toBeInTheDocument();
    await chooseAttribute();
    expect(mocks.listAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["1", "2"] }),
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Device 1" }));
    await chooseAttribute("level");
    expect(
      screen.getByText("This command no longer follows the filter."),
    ).toBeVisible();
    expect(new URLSearchParams(router.state.location.search).get("ids")).toBe(
      "2",
    );
    expect(
      screen.getByRole("checkbox", { name: "Device boiler" }),
    ).not.toBeChecked();
  });

  it("keeps an incompatible device selected and restores its preview when switching back", async () => {
    mocks.devices = [
      device("1", 21, {
        setpoint: { read_write_modes: ["read", "write"], current_value: 21 },
      }),
      device("2"),
    ];
    mount("/devices/commands/new?ids=1,2");
    await chooseAttribute("setpoint");
    await chooseAttribute("level");
    expect(screen.getByRole("checkbox", { name: "Device 1" })).toBeChecked();
    expect(screen.getByText("Attribute absent")).toBeVisible();
    expect(
      screen.getByText("1 of 2 selected devices will receive the command"),
    ).toBeVisible();
    await chooseAttribute("setpoint");
    expect(screen.queryByText("Attribute absent")).not.toBeInTheDocument();
    expect(
      screen.getByText("2 of 2 selected devices will receive the command"),
    ).toBeVisible();
  });

  it("disables dispatch when none of the selected devices can receive the attribute", async () => {
    mocks.devices = [
      device("read-only", 0, { setpoint: { read_write_modes: ["read"] } }),
    ];
    mount("/devices/commands/new?ids=read-only&attribute=setpoint&value=23");
    expect(await screen.findByText("Read-only attribute")).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: "Device read-only" }),
    ).toBeChecked();
    expect(screen.getByRole("button", { name: "Dispatch now" })).toBeDisabled();
  });

  it("keeps selected devices across attribute changes and explains exclusions", async () => {
    mocks.devices.push(
      device("read-only", 0, { setpoint: { read_write_modes: ["read"] } }),
      device("absent", 0, {}),
    );
    mount();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    await chooseAttribute();
    expect(screen.getByRole("checkbox", { name: "Device 1" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Device 2" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Device read-only" }),
    ).toBeChecked();
    expect(screen.getByText("2 devices not concerned")).toBeVisible();
    expect(
      screen.getByText("2 of 4 selected devices will receive the command"),
    ).toBeVisible();
    expect(screen.getByText("Read-only attribute")).toBeVisible();
    expect(screen.getByText("Attribute absent")).toBeVisible();
    expect(screen.getByLabelText(/Value/)).toHaveValue(21);
    await userEvent.click(screen.getByRole("checkbox", { name: "Device 1" }));
    await chooseAttribute("level");
    expect(
      screen.getByRole("checkbox", { name: "Device 1" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Device read-only" }),
    ).toBeChecked();
    expect(screen.getByLabelText(/Value/)).toHaveValue(5);
  });

  it("leaves mixed current values blank and shows their range", async () => {
    mocks.devices = [device("1", 19), device("2", 21)];
    mount();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    await chooseAttribute();
    expect(screen.getByLabelText(/Value/)).toHaveValue(null);
    expect(await screen.findByText("Currently 19–21 °C")).toBeVisible();
    expect(screen.getByRole("button", { name: "Dispatch now" })).toBeDisabled();
  });

  it("materializes exceptions from Filters and visibly switches to Devices", async () => {
    const { router } = mount(
      "/devices/commands/new?scope=building&mode=filters&attribute=setpoint",
    );
    await screen.findByRole("checkbox", { name: "Device 1" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Device 1" }));
    expect(screen.getByRole("tab", { name: "Devices" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByText("This command no longer follows the filter."),
    ).toBeVisible();
    expect(new URLSearchParams(router.state.location.search).get("ids")).toBe(
      "2",
    );
    await userEvent.click(screen.getByRole("button", { name: "Dispatch now" }));
    await waitFor(() =>
      expect(mocks.preview).toHaveBeenCalledWith(
        expect.objectContaining({ target: { ids: ["2"] } }),
      ),
    );
  });

  it("expands a live building target through empty rooms and stays on the page after dispatch", async () => {
    const { router } = mount(
      "/devices/commands/new?scope=building&mode=filters&attribute=setpoint&value=23",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Dispatch now" }),
      ).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Dispatch now" }));
    await confirmReview();
    await screen.findByText("Dispatch results");
    await waitFor(() =>
      expect(mocks.preview).toHaveBeenCalledWith(
        expect.objectContaining({
          attribute: "setpoint",
          value: 23,
          target: {
            ids: ["1", "2"],
            tags: { asset_id: ["building", "room", "empty-room"] },
          },
        }),
      ),
    );
    expect(mocks.confirm).toHaveBeenCalledWith({
      token: "token",
      device_ids: ["1", "2"],
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(await screen.findByText("Success")).toBeVisible();
    expect(await screen.findByText("Failed")).toBeVisible();
    expect(router.state.location.pathname).toBe("/devices/commands/new");
    expect(
      screen.getByRole("link", { name: "View full command history" }),
    ).toHaveAttribute("href", "/devices/commands?batch_id=batch");
    expect(mocks.listCommands).toHaveBeenCalledWith(
      expect.objectContaining({ batch_id: "batch" }),
    );
  });

  it.each([2, 10, 11])("uses the same review for %s devices", async (count) => {
    mocks.devices = Array.from({ length: count }, (_, index) =>
      device(String(index + 1)),
    );
    mount(
      `/devices/commands/new?attribute=setpoint&value=23&ids=${mocks.devices.map((d) => d.id).join(",")}`,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Dispatch now" }),
      ).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Dispatch now" }));
    const dialog = await screen.findByRole("dialog");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.confirm).not.toHaveBeenCalled();
    await userEvent.click(
      within(dialog).getByRole("button", { name: `Apply to ${count}` }),
    );
    await waitFor(() =>
      expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith({
        token: "token",
        device_ids: mocks.devices.map((d) => d.id),
      }),
    );
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps excluded targets visible and sends nothing when none are eligible", async () => {
    mocks.preview.mockImplementation(async (request) => ({
      ...request,
      token: "token",
      members: [previewMember("1", false), previewMember("2", false)],
    }));
    mount("/devices/commands/new?attribute=setpoint&value=23&ids=1,2");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Dispatch now" }),
      ).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Dispatch now" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Apply to 0" }),
    ).toBeDisabled();
    expect(within(dialog).getByText("Device 1")).toBeVisible();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.listCommands).not.toHaveBeenCalled();
  });

  it("warns about bounds without blocking dispatch", async () => {
    mount("/devices/commands/new?attribute=setpoint&value=30&ids=1,2");
    await waitFor(() =>
      expect(screen.getAllByText("Will be refused above 25.")).toHaveLength(2),
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/Value/)).toHaveAttribute("max", "25"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Dispatch now" }));
    expect(mocks.confirm).not.toHaveBeenCalled();
    await confirmReview();
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
  });

  it("keeps typing a value out of history and ignores old drafts and steps", async () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn().mockReturnValue(JSON.stringify({ value: 99 })),
    });
    const { router } = mount([
      "/devices/commands/new?ids=1",
      "/devices/commands/new?attribute=setpoint&value=23&ids=1&step=3",
    ]);
    await screen.findByLabelText(/Value/);
    expect(screen.getByLabelText(/Value/)).toHaveValue(23);
    expect(new URLSearchParams(router.state.location.search).has("step")).toBe(
      false,
    );
    expect(localStorage.getItem).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Value/), "45");
    await waitFor(() =>
      expect(screen.getByLabelText(/Value/)).toHaveValue(2345),
    );
    // Two keystrokes, no new entry: back leaves the value edit instead of
    // rewinding it one character at a time.
    await act(async () => router.navigate(-1));
    await waitFor(() =>
      expect(
        new URLSearchParams(router.state.location.search).get("attribute"),
      ).toBe(null),
    );
    expect(screen.getByRole("checkbox", { name: "Device 1" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Device 2" }),
    ).not.toBeChecked();
  });

  it("restores the attribute and ids with back navigation", async () => {
    const { router } = mount("/devices/commands/new?ids=1,2");
    await chooseAttribute("setpoint");
    await chooseAttribute("level");
    expect(
      new URLSearchParams(router.state.location.search).get("attribute"),
    ).toBe("level");
    await act(async () => router.navigate(-1));
    await waitFor(() =>
      expect(
        new URLSearchParams(router.state.location.search).get("attribute"),
      ).toBe("setpoint"),
    );
    expect(new URLSearchParams(router.state.location.search).get("ids")).toBe(
      "1,2",
    );
  });

  it.each(["/devices/1/commands/new", "/assets/building/commands/new"])(
    "locks the target on %s",
    async (path) => {
      mount(`${path}?attribute=setpoint&ids=2&mode=devices`);
      await screen.findByLabelText(/Value/);
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Scope")).toBeDisabled();
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Dispatch now" }),
        ).toBeEnabled(),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Dispatch now" }),
      );
      await waitFor(() =>
        path.includes("/assets/")
          ? expect(mocks.preview).toHaveBeenCalledWith(
              expect.objectContaining({
                target: {
                  ids: ["1", "2"],
                  tags: { asset_id: ["building", "room", "empty-room"] },
                },
              }),
            )
          : expect(mocks.preview).toHaveBeenCalledWith(
              expect.objectContaining({ target: { ids: ["1"] } }),
            ),
      );
    },
  );

  it.each(["devices", "filters"])(
    "keeps %s selection semantics when the device list changes",
    async (mode) => {
      const { router } = mount(
        `/devices/commands/new?attribute=setpoint&value=23&scope=building&ids=1,2&mode=${mode}`,
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Dispatch now" }),
        ).toBeEnabled(),
      );
      mocks.devices = [...mocks.devices, device("3")];
      await act(async () =>
        router.navigate(
          `${router.state.location.pathname}${router.state.location.search}&refresh=1`,
        ),
      );
      const added = await screen.findByRole("checkbox", { name: "Device 3" });
      if (mode === "devices") expect(added).not.toBeChecked();
      else expect(added).toBeChecked();
    },
  );

  it("does not broaden scope when the asset tree fails to load", async () => {
    mocks.assetsError = new Error("Unavailable");
    mount("/devices/commands/new?attribute=setpoint&value=23&ids=1,2");
    expect(
      screen.queryByRole("button", { name: "Dispatch now" }),
    ).not.toBeInTheDocument();
    expect(mocks.listAttributes).not.toHaveBeenCalled();
  });

  describe("boolean attribute", () => {
    const valueLabels = [
      { value: false, label: { default: "Stopped" } },
      { value: true, label: { default: "Running" } },
    ];
    function boolDevice(id: string) {
      return device(id, 21, {
        enabled: {
          name: "enabled",
          data_type: "bool",
          read_write_modes: ["read", "write"],
          current_value: false,
          value_labels: valueLabels,
        },
      });
    }
    function mockBoolCoverage(value_labels: typeof valueLabels | null) {
      mocks.listAttributes.mockResolvedValue({
        total_devices: 2,
        attributes: [
          {
            attribute: "enabled",
            data_types: ["bool"],
            device_count: 2,
            writable_count: 2,
            value_labels,
          },
        ],
      });
    }

    it("labels the switch and the review with the unanimous value_labels", async () => {
      mocks.devices = [boolDevice("1"), boolDevice("2")];
      mockBoolCoverage(valueLabels);
      mount("/devices/commands/new?attribute=enabled&value=true&ids=1,2");
      expect(await screen.findByRole("switch")).toBeChecked();
      // Switch side + each device's current value (false) in the review.
      expect(screen.getAllByText("Stopped")).toHaveLength(3);
      // Switch side + the chosen value on each device's review line.
      expect(screen.getAllByText("Running")).toHaveLength(3);
      expect(screen.queryByText(/^(ON|OFF|true|false)$/)).toBeNull();
    });

    it("falls back to False / True when the devices disagree on labels", async () => {
      mocks.devices = [boolDevice("1"), boolDevice("2")];
      mockBoolCoverage(null);
      mount("/devices/commands/new?attribute=enabled&value=false&ids=1,2");
      expect(await screen.findByRole("switch")).not.toBeChecked();
      expect(screen.getByText("True")).toBeInTheDocument();
      // Switch side + current and chosen value on each of the two review lines.
      expect(screen.getAllByText("False")).toHaveLength(5);
      expect(screen.queryByText("Stopped")).toBeNull();
    });
  });

  it("requires a template name and keeps named saves separate from dispatch", async () => {
    mount("/devices/commands/new?attribute=setpoint&value=23&ids=1,2");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save as template" }),
      ).toBeEnabled(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save as template" }),
    );
    await userEvent.click(
      screen.getAllByRole("button", { name: "Save as template" })[1],
    );
    expect(await screen.findByText("Enter a template name.")).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("Template name"), "Morning");
    await userEvent.click(
      screen.getAllByRole("button", { name: "Save as template" })[1],
    );
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Morning" }),
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "Dispatch now" }));
    await confirmReview();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Morning" }),
    );
  });
});

async function confirmReview() {
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(
    within(dialog).getByRole("button", { name: /^Apply to / }),
  );
  await userEvent.click(
    await within(dialog).findByRole("button", { name: "Close results" }),
  );
}

it("returns to the same executed batch without preparing or sending it again", async () => {
  const { router } = mount(
    "/devices/commands/new?scope=building&mode=filters&attribute=setpoint&value=23",
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Dispatch now" })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole("button", { name: "Dispatch now" }));
  await confirmReview();
  await screen.findByText("Success");
  await userEvent.click(screen.getByRole("link", { name: "Device 1" }));
  expect(router.state.location.pathname).toBe("/devices/1");
  await userEvent.click(screen.getByRole("link"));
  expect(await screen.findByText("Dispatch results")).toBeVisible();
  expect(await screen.findByText("Success")).toBeVisible();
  expect(await screen.findByText("Failed")).toBeVisible();
  expect(mocks.preview).toHaveBeenCalledTimes(1);
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
