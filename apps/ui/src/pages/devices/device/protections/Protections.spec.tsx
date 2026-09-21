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
      ["command", "running", "pressure", "setpoint"].map((name) => [
        name,
        {
          kind: "standard",
          name,
          data_type:
            name === "pressure" || name === "setpoint" ? "float" : "bool",
          read_write_modes:
            name === "command" || name === "setpoint"
              ? ["read", "write"]
              : ["read"],
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
  it("searches the whole fleet by device and point, then selects with the keyboard", async () => {
    const fleet = Array.from({ length: 100 }, (_, index) => ({
      ...device(`id-${index}`),
      name: `Thermostat ${index}`,
    }));
    api.devices.mockResolvedValue([device("a"), ...fleet]);
    const { user } = setup("/new");
    await user.click(
      await screen.findByRole("combobox", { name: "Observed point" }),
    );
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(40);
    const search = screen.getByRole("combobox", {
      name: "Search devices, attributes or IDs…",
    });
    expect(search).toHaveFocus();
    await user.type(search, "thermostat 99 running");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("id-99/running");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const trigger = screen.getByRole("combobox", { name: "Observed point" });
    expect(trigger).toHaveTextContent("Thermostat 99 · Running");
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    expect(
      screen.getByRole("combobox", {
        name: "Search devices, attributes or IDs…",
      }),
    ).toHaveValue("");
  });

  it("searches localized labels without accents and shows empty results without changing the selection", async () => {
    const source = device("b");
    source.attributes!.running = {
      ...source.attributes!.running,
      label: { default: "Marche / arrêt" },
    };
    api.devices.mockResolvedValue([device("a"), source]);
    const { user } = setup("/rule/edit");
    await user.click(
      await screen.findByRole("combobox", { name: "Observed point" }),
    );
    const search = screen.getByRole("combobox", {
      name: "Search devices, attributes or IDs…",
    });
    await user.type(search, "b arret");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.clear(search);
    await user.type(search, "no such point");
    expect(screen.getByText("No matching point.")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("combobox", { name: "Observed point" }),
    ).toHaveTextContent("Pump B · Marche / arrêt");
    expect(api.update).not.toHaveBeenCalled();
  });

  it("enables a per-protection freshness duration and persists it", async () => {
    const { user } = setup("/rule/edit");
    const toggle = await screen.findByRole("switch", {
      name: "Check data freshness",
    });
    expect(toggle).not.toBeChecked();
    expect(
      screen.queryByRole("spinbutton", { name: /Maximum age/ }),
    ).not.toBeInTheDocument();
    await user.click(toggle);
    const age = screen.getByRole("spinbutton", { name: /Maximum age/ });
    await user.clear(age);
    await user.type(age, "120");
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    await screen.findByText("Maximum age: 120 seconds");
    expect(api.update).toHaveBeenCalledWith(
      "rule",
      expect.objectContaining({ max_age_seconds: 120 }),
    );
  });

  it("loads an existing duration and allows disabling it", async () => {
    api.get.mockResolvedValue({
      protection: rule({ max_age_seconds: 300 }),
      reasons: [],
    });
    const { user } = setup("/rule/edit");
    const age = await screen.findByRole("spinbutton", { name: /Maximum age/ });
    expect(age).toHaveValue(300);
    await user.click(
      screen.getByRole("switch", { name: "Check data freshness" }),
    );
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    await screen.findAllByText("Disabled — no age limit");
    expect(api.update).toHaveBeenCalledWith(
      "rule",
      expect.objectContaining({ max_age_seconds: null }),
    );
  });

  it.each(["", "0", "-1"])(
    "rejects an enabled invalid freshness duration %s",
    async (value) => {
      const { user } = setup("/rule/edit");
      await user.click(
        await screen.findByRole("switch", { name: "Check data freshness" }),
      );
      const age = screen.getByRole("spinbutton", { name: /Maximum age/ });
      await user.clear(age);
      if (value) await user.type(age, value);
      await user.click(screen.getByRole("button", { name: "Save protection" }));
      await screen.findByText("Enter a duration greater than zero.");
      expect(age).toHaveAttribute("aria-invalid", "true");
      expect(api.update).not.toHaveBeenCalled();
    },
  );

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

  it("creates a rule from one condition row and a fixed target device", async () => {
    const { user } = setup("/new");
    await screen.findByLabelText(/Why this protection exists/);
    await user.type(
      screen.getByRole("textbox", { name: "Name" }),
      "Interlock A",
    );
    await user.type(
      screen.getByLabelText(/Why this protection exists/),
      "Only one pump",
    );
    await user.click(screen.getByRole("combobox", { name: "Attribute" }));
    await user.click(screen.getByRole("option", { name: "Command" }));
    await user.click(screen.getByRole("combobox", { name: "Requested value" }));
    await user.click(screen.getByRole("option", { name: "On" }));
    // One row, one control per part of the sentence: no nested value-source
    // or value-type selects on the way to "pump B running is false".
    await user.click(screen.getByRole("combobox", { name: "Observed point" }));
    await user.click(screen.getByRole("option", { name: /Pump B · Running/ }));
    await user.click(screen.getByRole("combobox", { name: "Comparison" }));
    await user.click(screen.getByRole("option", { name: "equals" }));
    await user.click(screen.getByRole("combobox", { name: "Compared value" }));
    await user.click(screen.getByRole("option", { name: "Off" }));
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    await screen.findByRole("heading", { name: "Interlock A" });
    expect(api.create).toHaveBeenCalledWith({
      name: "Interlock A",
      explanation: "Only one pump",
      max_age_seconds: null,
      target: { device_id: "a", attribute: "command", value: true },
      condition: {
        op: "eq",
        left: { device_id: "b", attribute: "running" },
        right: false,
      },
    });
  });

  it("previews the rule in plain words before it is saved", async () => {
    const { user } = setup("/new");
    await screen.findByLabelText(/Why this protection exists/);
    await user.click(screen.getByRole("combobox", { name: "Attribute" }));
    await user.click(screen.getByRole("option", { name: "Command" }));
    await user.click(screen.getByRole("combobox", { name: "Observed point" }));
    await user.click(screen.getByRole("option", { name: /Pump B · Pressure/ }));
    const preview = screen.getByText("In plain words").parentElement!;
    // The preview names the write it refuses and the point it watches, and
    // follows the point's type: a float point offers ordering comparisons.
    expect(preview).toHaveTextContent("Refuses");
    expect(preview).toHaveTextContent("Command");
    expect(preview).toHaveTextContent("Pump B · Pressure");
    await user.click(screen.getByRole("combobox", { name: "Comparison" }));
    expect(
      screen.getByRole("option", { name: "is greater than" }),
    ).toBeInTheDocument();
  });

  it("wraps a boolean row back to equality when it moves to a boolean point", async () => {
    api.get.mockResolvedValue({
      protection: rule({
        condition: {
          op: "gt",
          left: { device_id: "b", attribute: "pressure" },
          right: 4,
        },
      }),
      reasons: [],
    });
    const { user } = setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    await user.click(screen.getByRole("combobox", { name: "Observed point" }));
    await user.click(screen.getByRole("option", { name: /Pump B · Running/ }));
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        "rule",
        expect.objectContaining({
          condition: {
            op: "eq",
            left: { device_id: "b", attribute: "running" },
            right: false,
          },
        }),
      ),
    );
  });

  it("keeps a lone condition lone and wraps it only when a second is added", async () => {
    const { user } = setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    // A single row shows no All/Any switch: there is nothing to combine yet.
    expect(
      screen.queryByRole("group", { name: "Combine conditions" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add condition" }));
    const added = screen.getAllByRole("combobox", {
      name: "Observed point",
    })[1];
    await user.click(added);
    await user.click(screen.getByRole("option", { name: /Pump B · Running/ }));
    const combine = screen.getByRole("group", { name: "Combine conditions" });
    await user.click(within(combine).getByRole("button", { name: "Any" }));
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        "rule",
        expect.objectContaining({
          condition: {
            op: "any",
            conditions: [
              rule().condition,
              {
                op: "eq",
                left: { device_id: "b", attribute: "running" },
                right: false,
              },
            ],
          },
        }),
      ),
    );
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
    // The shapes the rows cannot draw stay reachable as expressions, and the
    // rule round-trips byte for byte when only its metadata is edited.
    expect(
      screen.getAllByRole("button", { name: "Edit as expression" }),
    ).toHaveLength(2);
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
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
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "My draft" },
    });
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    await screen.findByText(/Your draft is preserved/);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
      "My draft",
    );
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
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
      "My draft",
    );
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
    expect(
      screen.getByRole("combobox", { name: "Observed point" }),
    ).toHaveAttribute("aria-invalid", "true");
    // The preview says the rule is broken rather than printing a dangling id.
    expect(screen.getAllByText("Deleted point").length).toBeGreaterThan(0);
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
    await screen.findByDisplayValue("Pump interlock");
    await user.click(screen.getByRole("combobox", { name: "Observed point" }));
    await user.click(screen.getByRole("option", { name: /Pump B · Pressure/ }));
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

  it("keeps a calculated comparison out of the row controls", async () => {
    // A row cannot draw "pressure > (pressure + 2)". Rendering it as a point
    // picker would show an empty control and destroy the calculation on the
    // first click, so the whole condition stays an expression.
    const condition: Protection["condition"] = {
      op: "gt",
      left: { device_id: "b", attribute: "pressure" },
      right: {
        op: "add",
        args: [{ device_id: "b", attribute: "pressure" }, 2],
      },
    };
    api.get.mockResolvedValue({ protection: rule({ condition }), reasons: [] });
    setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    expect(
      screen.getAllByRole("button", { name: "Edit as expression" }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("combobox", { name: "Compared point" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Observed point" }),
    ).not.toBeInTheDocument();
  });

  it("offers ordering comparisons only where they mean something", async () => {
    const { user } = setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    // The loaded row observes a boolean point.
    await user.click(screen.getByRole("combobox", { name: "Comparison" }));
    expect(
      screen.queryByRole("option", { name: "is greater than" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "is one of" }),
    ).toBeInTheDocument();
  });

  it("keeps a compatible value when only the comparison changes", async () => {
    api.get.mockResolvedValue({
      protection: rule({
        condition: {
          op: "gt",
          left: { device_id: "b", attribute: "pressure" },
          right: 5,
        },
      }),
      reasons: [],
    });
    const { user } = setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    await user.click(screen.getByRole("combobox", { name: "Comparison" }));
    await user.click(screen.getByRole("option", { name: "is at least" }));
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        "rule",
        expect.objectContaining({
          condition: {
            op: "gte",
            left: { device_id: "b", attribute: "pressure" },
            right: 5,
          },
        }),
      ),
    );
  });

  it("retypes the requested value when the protected attribute changes", async () => {
    const { user } = setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    await user.click(screen.getByRole("combobox", { name: "Attribute" }));
    await user.click(screen.getByRole("option", { name: "Setpoint" }));
    // A boolean "On" must not survive onto a float attribute.
    expect(
      screen.getByRole("spinbutton", { name: "Requested value" }),
    ).toHaveValue(0);
  });

  it("does not leave duplicate allowed values after a type change", async () => {
    api.get.mockResolvedValue({
      protection: rule({
        condition: {
          op: "in",
          value: { device_id: "b", attribute: "pressure" },
          values: [1, 2, 3],
        },
      }),
      reasons: [],
    });
    const { user } = setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    await user.click(screen.getByRole("combobox", { name: "Observed point" }));
    await user.click(screen.getByRole("option", { name: /Pump B · Running/ }));
    await user.click(screen.getByRole("button", { name: "Save protection" }));
    // Three numbers collapse onto one boolean default: keeping three copies of
    // `false` would silently change what the rule says.
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        "rule",
        expect.objectContaining({
          condition: {
            op: "in",
            value: { device_id: "b", attribute: "running" },
            values: [false],
          },
        }),
      ),
    );
  });

  it("draws one level of groups and sends the rest to the expression editor", async () => {
    api.get.mockResolvedValue({
      protection: rule({
        condition: {
          op: "all",
          conditions: [
            rule().condition,
            { op: "any", conditions: [rule().condition, rule().condition] },
          ],
        },
      }),
      reasons: [],
    });
    setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    expect(
      screen.getAllByRole("group", { name: "Combine conditions" }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Add a group…" }),
    ).toBeInTheDocument();
  });

  it("keeps an existing one-condition group visible and switchable", async () => {
    api.get.mockResolvedValue({
      protection: rule({
        condition: { op: "any", conditions: [rule().condition] },
      }),
      reasons: [],
    });
    setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    const combine = screen.getByRole("group", { name: "Combine conditions" });
    expect(
      within(combine).getByRole("button", { name: "Any" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("reads each rule as a sentence and marks a retired one", async () => {
    api.list.mockResolvedValue([
      { protection: rule(), reasons: [] },
      {
        protection: rule({
          id: "old",
          name: "Retired rule",
          retirement: {
            reason: "Superseded",
            actor_id: "admin",
            retired_at: "2026-08-04T09:00:00Z",
          },
        }),
        reasons: [],
      },
    ]);
    setup();
    const row = await screen.findByRole("link", { name: /Pump interlock/ });
    // The sentence names the write and its condition in words, with no raw ids.
    expect(row).toHaveTextContent("Refuses");
    expect(row).toHaveTextContent("Command → On");
    expect(row).toHaveTextContent("Pump B · Running");
    expect(row).toHaveTextContent("equals");
    expect(row).toHaveTextContent("Off");
    expect(row).not.toHaveTextContent("dev_");
    const retired = screen.getByRole("link", { name: /Retired rule/ });
    expect(retired).toHaveTextContent("Retired");
    expect(retired).toHaveTextContent("Refused");
  });

  it("summarises the conditions a list row does not spell out", async () => {
    const one = rule().condition;
    api.list.mockResolvedValue([
      {
        protection: rule({
          condition: { op: "all", conditions: [one, one, one, one] },
        }),
        reasons: [],
      },
    ]);
    setup();
    const row = await screen.findByRole("link", { name: /Pump interlock/ });
    expect(row).toHaveTextContent("2 more conditions");
  });

  it("truncates a nested group too", async () => {
    const one = rule().condition;
    api.list.mockResolvedValue([
      {
        protection: rule({
          condition: {
            op: "all",
            conditions: [{ op: "any", conditions: [one, one, one, one, one] }],
          },
        }),
        reasons: [],
      },
    ]);
    setup();
    const row = await screen.findByRole("link", { name: /Pump interlock/ });
    expect(row).toHaveTextContent("3 more conditions");
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
