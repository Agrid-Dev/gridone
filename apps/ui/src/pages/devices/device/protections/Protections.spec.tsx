import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { I18nextProvider } from "react-i18next";
import {
  GridoneError,
  type Device,
  type Protection,
  type ProtectionDefinition,
} from "@gridone/sdk";
import i18n from "@/i18n";
import DeviceProtections from "./index";
import schemas from "./__fixtures__/schemas.json";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  retire: vi.fn(),
  history: vi.fn(),
  schemas: vi.fn(),
  devices: vi.fn(),
  device: vi.fn(),
  editable: true,
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    protections: api,
    devices: { list: api.devices, get: api.device },
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) =>
    permission !== "protections:write" || api.editable,
}));
vi.mock("@/contexts/DeviceContext", () => ({
  useDeviceContext: () => ({ isConnected: true }),
}));

function device(id: string): Device {
  return {
    id,
    name: `Pump ${id.toUpperCase()}`,
    driver_id: "driver",
    transport_id: "transport",
    config: {},
    attributes: Object.fromEntries(
      ["command", "running", "pressure"].map((name) => [
        name,
        {
          kind: "standard",
          name,
          data_type: name === "pressure" ? "float" : "bool",
          read_write_modes: name === "command" ? ["read", "write"] : ["read"],
          current_value: null,
          last_updated: null,
          last_changed: null,
        },
      ]),
    ),
  };
}
function rule(overrides: Partial<Protection> = {}): Protection {
  return {
    id: "rule",
    name: "Pump interlock",
    explanation: "Only one pump may run",
    target: { device_id: "a", attribute: "command", value: true },
    condition: {
      op: "eq",
      left: { device_id: "b", attribute: "running" },
      right: false,
    },
    revision: 1,
    points: [
      { device_id: "a", attribute: "command", data_type: "bool" },
      { device_id: "b", attribute: "running", data_type: "bool" },
    ],
    created_at: "2026-09-21T10:00:00Z",
    updated_at: "2026-09-21T10:00:00Z",
    created_by: "admin",
    updated_by: "admin",
    ...overrides,
  };
}
beforeEach(async () => {
  vi.resetAllMocks();
  api.editable = true;
  await i18n.changeLanguage("en");
  api.schemas.mockResolvedValue(schemas);
  api.devices.mockResolvedValue([device("a"), device("b")]);
  api.device.mockImplementation(async (id) => device(id));
  api.list.mockResolvedValue([{ protection: rule(), reasons: [] }]);
  api.get.mockResolvedValue({ protection: rule(), reasons: [] });
  api.history.mockResolvedValue([rule()]);
  api.create.mockImplementation(async (body: ProtectionDefinition) => {
    const saved = rule(body);
    api.get.mockResolvedValue({ protection: saved, reasons: [] });
    return saved;
  });
  api.update.mockImplementation(
    async (_: string, body: ProtectionDefinition) => {
      const saved = rule({ ...body, revision: 2 });
      api.get.mockResolvedValue({ protection: saved, reasons: [] });
      return saved;
    },
  );
  api.retire.mockImplementation(async (_: string, body: { reason: string }) => {
    const saved = rule({
      revision: 2,
      retirement: {
        reason: body.reason,
        actor_id: "admin",
        retired_at: "2026-09-21T11:00:00Z",
      },
    });
    api.get.mockResolvedValue({ protection: saved, reasons: [] });
    api.history.mockResolvedValue([rule(), saved]);
    return saved;
  });
});
afterEach(cleanup);
function setup(suffix = "") {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={cache}>
        <MemoryRouter
          initialEntries={[`/devices/a/config/protections${suffix}`]}
        >
          <Routes>
            <Route
              path="/devices/:deviceId/config/protections/*"
              element={<DeviceProtections />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { user, cache };
}

describe("device protections", () => {
  it("lists protections for the current device and opens its nested create page", async () => {
    api.list.mockResolvedValue([]);
    setup();
    await screen.findByText("No protections for this device");
    expect(api.list).toHaveBeenCalledWith("a");
    for (const link of screen.getAllByRole("link", {
      name: "Create protection",
    }))
      expect(link).toHaveAttribute("href", "/devices/a/config/protections/new");
  });

  it("creates a rule with typed point selectors and a fixed target device", async () => {
    const { user } = setup("/new");
    await screen.findByLabelText(/Why this protection exists/);
    await user.type(screen.getByLabelText(/^Name/), "Interlock A");
    await user.type(
      screen.getByLabelText(/Why this protection exists/),
      "Only one pump",
    );
    const target = screen.getByRole("region", { name: "Protected write" });
    expect(
      within(target).getByRole("combobox", { name: "Device" }),
    ).toBeDisabled();
    await user.click(
      within(target).getByRole("combobox", { name: "Attribute" }),
    );
    await user.click(screen.getByRole("option", { name: "Command · command" }));
    await user.click(
      within(target).getByRole("combobox", { name: "Requested value" }),
    );
    await user.click(screen.getByRole("option", { name: "True / on" }));
    const observed = screen.getByRole("group", { name: "Observed value" });
    await user.click(
      within(observed).getByRole("combobox", { name: "Device" }),
    );
    await user.click(screen.getByRole("option", { name: "Pump B · b" }));
    await user.click(
      within(observed).getByRole("combobox", { name: "Attribute" }),
    );
    await user.click(screen.getByRole("option", { name: "Running · running" }));
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    await screen.findByRole("heading", { name: "Interlock A" });
    expect(api.create).toHaveBeenCalledWith({
      name: "Interlock A",
      explanation: "Only one pump",
      target: { device_id: "a", attribute: "command", value: true },
      condition: {
        op: "eq",
        left: { device_id: "b", attribute: "running" },
        right: false,
      },
    });
  });

  it("preserves a composed condition exactly when editing metadata", async () => {
    const condition: Protection["condition"] = {
      op: "all",
      conditions: [
        rule().condition,
        {
          op: "not",
          condition: { op: "in", value: { candidate: true }, values: [false] },
        },
        {
          op: "gt",
          left: {
            op: "if",
            condition: {
              op: "is_known",
              value: { device_id: "b", attribute: "pressure" },
            },
            then: {
              op: "add",
              args: [{ device_id: "b", attribute: "pressure" }, 2],
            },
            otherwise: 0,
          },
          right: 1,
        },
      ],
    };
    api.get.mockResolvedValue({ protection: rule({ condition }), reasons: [] });
    setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save protection" }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        "rule",
        expect.objectContaining({ name: "Updated", condition, revision: 1 }),
      ),
    );
  });

  it("preserves draft values after a conflict until the saved revision is reviewed", async () => {
    api.update.mockRejectedValueOnce(new GridoneError(409, "changed"));
    const { user } = setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "My draft" },
    });
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    await screen.findByText(/Your draft is preserved/);
    expect(screen.getByLabelText(/^Name/)).toHaveValue("My draft");
    expect(
      screen.getByRole("button", { name: "Save protection" }),
    ).toBeDisabled();
    api.get.mockResolvedValue({
      protection: rule({ name: "Someone else's edit", revision: 2 }),
      reasons: [],
    });
    await user.click(
      screen.getByRole("button", { name: "Load latest version" }),
    );
    await screen.findByText("Latest version · revision 2");
    expect(screen.getByLabelText(/^Name/)).toHaveValue("My draft");
    expect(api.update).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Keep my draft for the next save" }),
    );
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    await waitFor(() =>
      expect(api.update).toHaveBeenLastCalledWith(
        "rule",
        expect.objectContaining({ name: "My draft", revision: 2 }),
      ),
    );
  });

  it("keeps broken references visible and lets an administrator repair them", async () => {
    api.devices.mockResolvedValue([device("a")]);
    api.get.mockResolvedValue({
      protection: rule(),
      reasons: [{ code: "protection_reference_invalid" }],
    });
    setup("/rule/edit");
    await screen.findByText(/point b \/ running is missing/);
    expect(screen.getAllByText("Unavailable: b").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unavailable: running").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByRole("button", { name: "Save protection" }),
    ).toBeEnabled();
  });

  it("keeps membership values compatible when the observed point type changes", async () => {
    api.get.mockResolvedValue({
      protection: rule({
        condition: {
          op: "in",
          value: { device_id: "b", attribute: "running" },
          values: [false],
        },
      }),
      reasons: [],
    });
    const { user } = setup("/rule/edit");
    const observed = await screen.findByRole("group", {
      name: "Value to check",
    });
    await user.click(
      within(observed).getByRole("combobox", { name: "Attribute" }),
    );
    await user.click(
      screen.getByRole("option", { name: "Pressure · pressure" }),
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: /Allowed value 1/ }),
      { target: { value: "2.5" } },
    );
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        "rule",
        expect.objectContaining({
          condition: {
            op: "in",
            value: { device_id: "b", attribute: "pressure" },
            values: [2.5],
          },
        }),
      ),
    );
  });

  it("does not display a rule under a different device", async () => {
    api.get.mockResolvedValue({
      protection: rule({
        target: { device_id: "b", attribute: "command", value: true },
      }),
      reasons: [],
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      setup("/rule");
      await screen.findByText("Not found");
      expect(
        screen.queryByRole("heading", { name: "Pump interlock" }),
      ).not.toBeInTheDocument();
    } finally {
      error.mockRestore();
    }
  });

  it("cannot rebase a draft after its rule has moved to another device", async () => {
    api.update.mockRejectedValueOnce(new GridoneError(409, "changed"));
    const { user } = setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    await screen.findByText(/Your draft is preserved/);
    api.get.mockResolvedValue({
      protection: rule({
        revision: 2,
        target: { device_id: "b", attribute: "command", value: true },
      }),
      reasons: [],
    });
    await user.click(
      screen.getByRole("button", { name: "Load latest version" }),
    );
    await screen.findByText(
      "Unable to save or load this protection. Please try again.",
    );
    expect(
      screen.getByRole("button", { name: "Save protection" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Keep my draft for the next save" }),
    ).not.toBeInTheDocument();
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it("requires a nonblank retirement reason and retains the server audit in history", async () => {
    const { user } = setup("/rule");
    await user.click(
      await screen.findByRole("button", { name: "Retire protection" }),
    );
    await screen.findByLabelText(/Reason for retirement/);
    await user.type(screen.getByLabelText(/Reason for retirement/), "   ");
    await user.click(
      screen.getByRole("button", { name: "Confirm retirement" }),
    );
    await screen.findByText("Enter a nonblank value.");
    expect(api.retire).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText(/Reason for retirement/));
    await user.type(
      screen.getByLabelText(/Reason for retirement/),
      " Wiring removed ",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm retirement" }),
    );
    await waitFor(() =>
      expect(api.retire).toHaveBeenCalledWith("rule", {
        reason: "Wiring removed",
        revision: 1,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByText("Wiring removed").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("link", { name: "Edit protection" }),
    ).not.toBeInTheDocument();
  });

  it.each(["/new", "/rule/edit"])(
    "prevents non-admin access to %s",
    async (suffix) => {
      api.editable = false;
      setup(suffix);
      await screen.findByText(
        "Only administrators can create, edit or retire protections.",
      );
      expect(api.create).not.toHaveBeenCalled();
      expect(api.update).not.toHaveBeenCalled();
    },
  );

  it("keeps detail and history readable for non-admin users", async () => {
    api.editable = false;
    setup("/rule");
    await screen.findByRole("heading", { name: "Pump interlock" });
    await screen.findByText(/Revision 1/);
    expect(
      screen.queryByRole("button", { name: "Retire protection" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Edit protection" }),
    ).not.toBeInTheDocument();
  });

  it("shows a safe message on a server error without revealing exception text", async () => {
    api.update.mockRejectedValue(
      new GridoneError(500, "private database path"),
    );
    setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    fireEvent.click(screen.getByRole("button", { name: "Save protection" }));
    await screen.findByText(
      "Unable to save or load this protection. Please try again.",
    );
    expect(screen.queryByText(/private database/)).not.toBeInTheDocument();
  });
});
