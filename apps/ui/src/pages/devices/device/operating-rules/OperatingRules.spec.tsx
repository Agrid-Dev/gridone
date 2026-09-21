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
  type OperatingRule,
  type OperatingRuleDefinition,
} from "@gridone/sdk";
import i18n from "@/i18n";
import { clearNavigation } from "@/lib/navigation";
import DeviceOperatingRules from "./index";
import schemas from "./__fixtures__/schemas.json";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setEnabled: vi.fn(),
  delete: vi.fn(),
  history: vi.fn(),
  schemas: vi.fn(),
  devices: vi.fn(),
  device: vi.fn(),
  editable: true,
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    operatingRules: api,
    devices: { list: api.devices, get: api.device },
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) =>
    permission !== "operating_rules:write" || api.editable,
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
function rule(overrides: Partial<OperatingRule> = {}): OperatingRule {
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
  clearNavigation();
  api.editable = true;
  await i18n.changeLanguage("en");
  api.schemas.mockResolvedValue(schemas);
  api.devices.mockResolvedValue([device("a"), device("b")]);
  api.device.mockImplementation(async (id) => device(id));
  api.list.mockResolvedValue([{ operating_rule: rule(), reasons: [] }]);
  api.get.mockResolvedValue({ operating_rule: rule(), reasons: [] });
  api.history.mockResolvedValue([rule()]);
  api.create.mockImplementation(async (body: OperatingRuleDefinition) => {
    const saved = rule(body);
    api.get.mockResolvedValue({ operating_rule: saved, reasons: [] });
    return saved;
  });
  api.update.mockImplementation(
    async (_: string, body: OperatingRuleDefinition) => {
      const saved = rule({ ...body, revision: 2 });
      api.get.mockResolvedValue({ operating_rule: saved, reasons: [] });
      return saved;
    },
  );
  api.setEnabled.mockImplementation(
    async (_: string, body: { enabled: boolean; revision: number }) => {
      const saved = rule({
        enabled: body.enabled,
        revision: body.revision + 1,
      });
      api.get.mockResolvedValue({ operating_rule: saved, reasons: [] });
      api.history.mockResolvedValue([rule(), saved]);
      return saved;
    },
  );
  api.delete.mockImplementation(async () => {
    api.list.mockResolvedValue([]);
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
          initialEntries={[`/devices/a/config/operating-rules${suffix}`]}
        >
          <Routes>
            <Route
              path="/devices/:deviceId/config/operating-rules/*"
              element={<DeviceOperatingRules />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { user, cache };
}

describe("device operating rules", () => {
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

  it("enables a per-operating-rule freshness duration and persists it", async () => {
    const { user } = setup("/rule/edit");
    const toggle = await screen.findByRole("switch", {
      name: "Check data freshness",
    });
    expect(toggle).not.toBeChecked();
    // A vertical Field stretches every child to full width; the toggle sits on
    // a settings row so it keeps its own size.
    expect(toggle.closest('[data-slot="field"]')).toHaveAttribute(
      "data-orientation",
      "horizontal",
    );
    expect(
      screen.queryByRole("spinbutton", { name: /Maximum age/ }),
    ).not.toBeInTheDocument();
    await user.click(toggle);
    const age = screen.getByRole("spinbutton", { name: /Maximum age/ });
    await user.clear(age);
    await user.type(age, "120");
    await user.click(
      screen.getByRole("button", { name: "Save operating rule" }),
    );
    await screen.findByText("Maximum age: 120 seconds");
    expect(api.update).toHaveBeenCalledWith(
      "rule",
      expect.objectContaining({ max_age_seconds: 120 }),
    );
  });

  it("loads an existing duration and allows disabling it", async () => {
    api.get.mockResolvedValue({
      operating_rule: rule({ max_age_seconds: 300 }),
      reasons: [],
    });
    const { user } = setup("/rule/edit");
    const age = await screen.findByRole("spinbutton", { name: /Maximum age/ });
    expect(age).toHaveValue(300);
    await user.click(
      screen.getByRole("switch", { name: "Check data freshness" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Save operating rule" }),
    );
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
      await user.click(
        screen.getByRole("button", { name: "Save operating rule" }),
      );
      await screen.findByText("Enter a duration greater than zero.");
      expect(age).toHaveAttribute("aria-invalid", "true");
      expect(api.update).not.toHaveBeenCalled();
    },
  );

  it("lists operating rules for the current device and opens its nested create page", async () => {
    api.list.mockResolvedValue([]);
    setup();
    await screen.findByText("No operating rules for this device");
    expect(api.list).toHaveBeenCalledWith("a");
    for (const link of screen.getAllByRole("link", {
      name: "Create operating rule",
    }))
      expect(link).toHaveAttribute(
        "href",
        "/devices/a/config/operating-rules/new",
      );
  });

  it("creates a rule from one condition row and a fixed target device", async () => {
    const { user } = setup("/new");
    await screen.findByLabelText(/Why this operating rule exists/);
    await user.type(
      screen.getByRole("textbox", { name: "Name" }),
      "Interlock A",
    );
    await user.type(
      screen.getByLabelText(/Why this operating rule exists/),
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
    await user.click(
      screen.getByRole("button", { name: "Save operating rule" }),
    );
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
    await screen.findByLabelText(/Why this operating rule exists/);
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
      operating_rule: rule({
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
    await user.click(
      screen.getByRole("button", { name: "Save operating rule" }),
    );
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
    await user.click(
      screen.getByRole("button", { name: "Save operating rule" }),
    );
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
    const condition: OperatingRule["condition"] = {
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
    api.get.mockResolvedValue({
      operating_rule: rule({ condition }),
      reasons: [],
    });
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
    fireEvent.click(
      screen.getByRole("button", { name: "Save operating rule" }),
    );
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
    await user.click(
      screen.getByRole("button", { name: "Save operating rule" }),
    );
    await screen.findByText(/Your draft is preserved/);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
      "My draft",
    );
    expect(
      screen.getByRole("button", { name: "Save operating rule" }),
    ).toBeDisabled();
    api.get.mockResolvedValue({
      operating_rule: rule({ name: "Someone else's edit", revision: 2 }),
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
    await user.click(
      screen.getByRole("button", { name: "Save operating rule" }),
    );
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
      operating_rule: rule(),
      reasons: [{ code: "operating_rule_reference_invalid" }],
    });
    setup("/rule/edit");
    await screen.findByText(/point b \/ running is missing/);
    expect(
      screen.getByRole("combobox", { name: "Observed point" }),
    ).toHaveAttribute("aria-invalid", "true");
    // The preview says the rule is broken rather than printing a dangling id.
    expect(screen.getAllByText("Deleted point").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Save operating rule" }),
    ).toBeEnabled();
  });

  it("keeps membership values compatible when the observed point type changes", async () => {
    api.get.mockResolvedValue({
      operating_rule: rule({
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
    await user.click(
      screen.getByRole("button", { name: "Save operating rule" }),
    );
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
    const condition: OperatingRule["condition"] = {
      op: "gt",
      left: { device_id: "b", attribute: "pressure" },
      right: {
        op: "add",
        args: [{ device_id: "b", attribute: "pressure" }, 2],
      },
    };
    api.get.mockResolvedValue({
      operating_rule: rule({ condition }),
      reasons: [],
    });
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
      operating_rule: rule({
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
    await user.click(
      screen.getByRole("button", { name: "Save operating rule" }),
    );
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
      operating_rule: rule({
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
    await user.click(
      screen.getByRole("button", { name: "Save operating rule" }),
    );
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
      operating_rule: rule({
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
      operating_rule: rule({
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
      { operating_rule: rule(), reasons: [] },
      {
        operating_rule: rule({
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
        operating_rule: rule({
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
        operating_rule: rule({
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
      operating_rule: rule({
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
    await user.click(
      screen.getByRole("button", { name: "Save operating rule" }),
    );
    await screen.findByText(/Your draft is preserved/);
    api.get.mockResolvedValue({
      operating_rule: rule({
        revision: 2,
        target: { device_id: "b", attribute: "command", value: true },
      }),
      reasons: [],
    });
    await user.click(
      screen.getByRole("button", { name: "Load latest version" }),
    );
    await screen.findByText(
      "Unable to save or load this operating rule. Please try again.",
    );
    expect(
      screen.getByRole("button", { name: "Save operating rule" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Keep my draft for the next save" }),
    ).not.toBeInTheDocument();
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it("disables and re-enables a rule using the latest revision while retaining its history", async () => {
    const { user } = setup("/rule");
    const toggle = await screen.findByRole("switch", { name: "Rule enabled" });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(api.setEnabled).toHaveBeenLastCalledWith("rule", {
      enabled: false,
      revision: 1,
    });
    await screen.findByText(/Revision 2/);
    expect(
      screen.getByRole("link", { name: "Edit operating rule" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(api.setEnabled).toHaveBeenLastCalledWith("rule", {
      enabled: true,
      revision: 2,
    });
    await screen.findByText(/Revision 3/);
  });

  it("can reactivate an old retired rule", async () => {
    api.get.mockResolvedValue({
      operating_rule: rule({
        retirement: {
          reason: "Maintenance",
          actor_id: "admin",
          retired_at: "2026-09-21T11:00:00Z",
        },
      }),
      reasons: [],
    });
    const { user } = setup("/rule");
    const toggle = await screen.findByRole("switch", { name: "Rule enabled" });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(api.setEnabled).toHaveBeenCalledWith("rule", {
      enabled: true,
      revision: 1,
    });
  });

  it("requires confirmation before deleting and returns to the device list", async () => {
    const { user } = setup("/rule");
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    let dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Delete “Pump interlock”?");
    expect(api.delete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.delete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete operating rule" }),
    );
    await screen.findByText("No operating rules for this device");
    expect(api.delete).toHaveBeenCalledWith("rule", 1);
  });

  it("keeps the displayed state when a toggle fails and lets the user retry", async () => {
    api.setEnabled.mockRejectedValueOnce(new GridoneError(500, "private path"));
    const { user } = setup("/rule");
    const toggle = await screen.findByRole("switch", { name: "Rule enabled" });
    await user.click(toggle);
    await screen.findByRole("alert");
    expect(toggle).toBeChecked();
    expect(screen.queryByText(/private path/)).not.toBeInTheDocument();
    await user.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it.each(["toggle", "delete"])(
    "reloads stale data before retrying %s",
    async (action) => {
      const mutation = action === "toggle" ? api.setEnabled : api.delete;
      mutation.mockRejectedValueOnce(new GridoneError(409, "Changed"));
      const { user } = setup("/rule");
      const toggle = await screen.findByRole("switch", {
        name: "Rule enabled",
      });
      if (action === "toggle") await user.click(toggle);
      else {
        await user.click(screen.getByRole("button", { name: "Delete" }));
        await user.click(
          screen.getByRole("button", { name: "Delete operating rule" }),
        );
      }
      await screen.findByRole("button", { name: "Load latest version" });
      expect(toggle).toBeDisabled();
      if (action === "delete")
        expect(
          screen.getByRole("button", { name: "Delete operating rule" }),
        ).toBeDisabled();
      api.get.mockResolvedValue({
        operating_rule: rule({ name: "Updated rule", revision: 2 }),
        reasons: [],
      });
      await user.click(
        screen.getByRole("button", { name: "Load latest version" }),
      );
      await screen.findByRole("heading", { name: "Updated rule" });
      expect(mutation).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(toggle).toBeEnabled());
      if (action === "toggle") {
        await user.click(toggle);
        await waitFor(() =>
          expect(api.setEnabled).toHaveBeenLastCalledWith("rule", {
            enabled: false,
            revision: 2,
          }),
        );
      } else {
        await user.click(screen.getByRole("button", { name: "Delete" }));
        await user.click(
          screen.getByRole("button", { name: "Delete operating rule" }),
        );
        await waitFor(() =>
          expect(api.delete).toHaveBeenLastCalledWith("rule", 2),
        );
      }
    },
  );

  it("identifies disabled rules in the list", async () => {
    api.list.mockResolvedValue([
      { operating_rule: rule({ enabled: false }), reasons: [] },
    ]);
    setup();
    const row = await screen.findByRole("link", { name: /Pump interlock/ });
    expect(row).toHaveTextContent("Disabled");
    expect(row).toHaveTextContent("Refused");
  });

  it.each(["/new", "/rule/edit"])(
    "prevents non-admin access to %s",
    async (suffix) => {
      api.editable = false;
      setup(suffix);
      await screen.findByText(
        "Only administrators can manage operating rules.",
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
    expect(screen.getByRole("switch", { name: "Rule enabled" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Edit operating rule" }),
    ).not.toBeInTheDocument();
  });

  it("shows a safe message on a server error without revealing exception text", async () => {
    api.update.mockRejectedValue(
      new GridoneError(500, "private database path"),
    );
    setup("/rule/edit");
    await screen.findByDisplayValue("Pump interlock");
    fireEvent.click(
      screen.getByRole("button", { name: "Save operating rule" }),
    );
    await screen.findByText(
      "Unable to save or load this operating rule. Please try again.",
    );
    expect(screen.queryByText(/private database/)).not.toBeInTheDocument();
  });
});
