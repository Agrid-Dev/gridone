import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type {
  BatchDispatchResponse,
  Device,
  DevicesFilter,
  Driver,
  SelectionCommandConfirm,
  SelectionCommandPrepare,
  SelectionCommandPreview,
} from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { TagGroupControls } from "./TagGroupControls";

const api = vi.hoisted(() => ({
  drivers: {
    get: vi.fn(),
    getPresentation: vi.fn(),
    getPresentationAsset: vi.fn(),
  },
  devices: {
    previewCommand: vi.fn(),
    confirmCommand: vi.fn(),
    listCommands: vi.fn(),
  },
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => api,
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => true,
}));
vi.mock("react-i18next", () =>
  createI18nMock(
    {
      "presentation.increase": "Increase {{name}}",
      "presentation.decrease": "Decrease {{name}}",
      "presentation.range": "{{min}} to {{max}}",
      "groups.chooseTarget": "Choose target",
      "groups.absoluteTarget": "Choose a target for {{attribute}}",
      "groups.stageTarget": "Add setpoint",
      "groups.draftTitle": "Draft setpoints",
      "groups.reviewDrafts": "Review {{count}} setpoints",
      "groups.clearDrafts": "Clear all",
      "groups.removeDraft": "Remove {{attribute}}",
      "groups.applyWrites": "Apply {{count}} setpoints",
      "groups.apply": "Apply to {{count}}",
      "groups.previewTitle": "Preview {{name}}",
      "groups.previewDescription": "Set {{attribute}} to {{value}}",
      "groups.cancel": "Cancel",
      "groups.close": "Close results",
      "groups.resultsTitle": "Command results",
      "groups.resultsDescription": "Execution of prepared setpoints",
      "groups.sending": "Sending setpoints",
      "groups.batchSummary":
        "Succeeded {{success}}, failed {{failed}}, pending {{pending}}",
      "groups.historyAttribute": "History for {{attribute}}",
    },
    { language: "en" },
  ),
);

const filter: DevicesFilter = {
  tags: { circuit: ["east"] },
  driver_id: "driver",
};
const driver: Driver = {
  id: "driver",
  model: "Thermostat",
  transport: "http",
  device_config: [],
  presentation_revision: null,
  attributes: [
    {
      name: "setpoint",
      data_type: "float",
      label: { default: "Setpoint" },
      unit: "°C",
      read: {},
      write: {},
      write_constraints: { minimum: 16, maximum: 30, step: 0.5 },
    },
    {
      name: "power",
      data_type: "bool",
      label: { default: "Power" },
      read: {},
      write: {},
    },
  ],
};
const members = ["a", "b"].map(
  (id): Device => ({
    id,
    name: id,
    driver_id: driver.id,
    transport_id: "transport",
    config: {},
    tags: { circuit: ["east"] },
    attributes: {
      setpoint: {
        name: "setpoint",
        data_type: "float",
        current_value: 22,
        write_state: {
          status: "ready",
          constraints: { minimum: 16, maximum: 30, step: 0.5 },
        },
        read_write_modes: ["read", "write"],
      },
      power: {
        name: "power",
        data_type: "bool",
        current_value: false,
        read_write_modes: ["read", "write"],
      },
    },
  }),
);
const sliderPresentation = {
  status: "available",
  revision: "slider-presentation",
  assets: {},
  document: {
    schema_version: 1,
    requires: ["layout/1", "controls/1"],
    assets: {},
    bindings: {
      setpoint: { attribute: "setpoint" },
      power: { attribute: "power" },
    },
    controls: {
      setpoint: {
        kind: "slider",
        binding: "setpoint",
        label: { default: "Setpoint" },
      },
      power: {
        kind: "toggle",
        binding: "power",
        label: { default: "Power" },
      },
    },
    page: {
      kind: "stack",
      children: [
        { kind: "control-panel", controls: ["setpoint", "power"] },
        { kind: "attributes" },
      ],
    },
  },
};

function setup() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={cache}>
        <TagGroupControls
          driverId={driver.id}
          filter={filter}
          devices={members}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return cache;
}

function expectReportedValues() {
  const rows = screen.getAllByRole("definition");
  expect(rows.some((row) => within(row).queryByText("22"))).toBe(true);
  expect(rows.some((row) => within(row).queryByText("false"))).toBe(true);
  for (const member of members) {
    expect(member.attributes?.setpoint.current_value).toBe(22);
    expect(member.attributes?.power.current_value).toBe(false);
  }
}

async function stageWithStepper() {
  const increase = await screen.findByRole("button", {
    name: "Increase Setpoint",
  });
  for (const value of [22.5, 23, 23.5, 24]) {
    fireEvent.click(increase);
    expect(
      screen.getByRole("button", { name: "Choose target: Setpoint" }),
    ).toHaveTextContent(`${value.toFixed(1)} °C`);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.devices.previewCommand).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  api.drivers.get.mockResolvedValue(driver);
  api.drivers.getPresentation.mockResolvedValue({
    status: "unavailable",
    revision: "none",
    diagnostics: [],
  });
  api.devices.previewCommand.mockImplementation(
    async (
      request: SelectionCommandPrepare,
    ): Promise<SelectionCommandPreview> => ({
      ...request,
      token: `${request.attribute}-${request.value}`,
      attribute_label: {
        default: request.attribute === "setpoint" ? "Setpoint" : "Power",
      },
      unit: request.attribute === "setpoint" ? "°C" : null,
      members: members.map((member) => ({
        device_id: member.id,
        name: member.name,
        current_value: request.attribute === "setpoint" ? 22 : false,
        eligible: true,
      })),
    }),
  );
  api.devices.confirmCommand.mockImplementation(
    async ({
      token,
      device_ids,
    }: SelectionCommandConfirm): Promise<BatchDispatchResponse> => ({
      batch_id: `batch-${token}`,
      commands: device_ids.map((device_id, index) => ({
        id: (token.startsWith("setpoint") ? 0 : 2) + index,
        batch_id: `batch-${token}`,
        template_id: null,
        device_id,
        attribute: token.startsWith("setpoint") ? "setpoint" : "power",
        value: token.startsWith("setpoint") ? 24 : true,
        data_type: token.startsWith("setpoint") ? "float" : "bool",
        status: "success",
        status_details: null,
        user_id: "operator",
        created_at: "2026-09-15T12:00:00Z",
        executed_at: "2026-09-15T12:00:01Z",
        completed_at: "2026-09-15T12:00:02Z",
      })),
    }),
  );
  api.devices.listCommands.mockResolvedValue({ items: [], total_pages: 1 });
});
afterEach(cleanup);

describe("group setpoint drafts", () => {
  it.each(["stepper", "slider"])(
    "stages repeated %s adjustments and another attribute before one review",
    async (control) => {
      if (control === "slider") {
        api.drivers.getPresentation.mockResolvedValue(sliderPresentation);
      }
      const cache = setup();
      if (control === "stepper") {
        await stageWithStepper();
      } else {
        const slider = await screen.findByRole("slider", {
          name: "Setpoint",
        });
        for (const value of [23, 24]) {
          fireEvent.change(slider, { target: { value: String(value) } });
          expect(slider).toHaveValue(String(value));
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
          expect(api.devices.previewCommand).not.toHaveBeenCalled();
        }
      }
      const power = screen.getByRole("switch", { name: "Power" });
      fireEvent.click(power);
      expect(power).toBeChecked();
      expectReportedValues();
      expect(api.devices.confirmCommand).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: "Review 2 setpoints" }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      for (const label of ["Setpoint", "Power"]) {
        expect(
          within(dialog).getByRole("region", { name: label }),
        ).toBeInTheDocument();
      }
      expect(api.devices.previewCommand).toHaveBeenCalledTimes(2);
      expect(api.devices.previewCommand).toHaveBeenCalledWith({
        target: filter,
        attribute: "setpoint",
        value: 24,
      });
      expect(api.devices.previewCommand).toHaveBeenCalledWith({
        target: filter,
        attribute: "power",
        value: true,
      });
      expect(api.devices.confirmCommand).not.toHaveBeenCalled();

      fireEvent.click(
        within(dialog).getByRole("button", { name: "Apply 2 setpoints" }),
      );
      expect(
        await within(dialog).findByRole("heading", { name: "Command results" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBe(dialog);
      expect(
        within(dialog).getByText("Succeeded 4, failed 0, pending 0"),
      ).toBeInTheDocument();
      for (const attribute of ["Setpoint", "Power"]) {
        expect(
          within(dialog).getAllByRole("link", {
            name: `History for ${attribute}`,
          }).length,
        ).toBeGreaterThan(0);
      }
      expect(api.devices.confirmCommand).toHaveBeenCalledTimes(2);
      expect(api.devices.confirmCommand).toHaveBeenCalledWith({
        token: "setpoint-24",
        device_ids: ["a", "b"],
      });
      expect(api.devices.confirmCommand).toHaveBeenCalledWith({
        token: "power-true",
        device_ids: ["a", "b"],
      });
      const apply = within(dialog).queryByRole("button", { name: /^Apply/ });
      if (apply) {
        expect(apply).toBeDisabled();
        fireEvent.click(apply);
      }
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Close results" }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expectReportedValues();
      expect(
        screen.queryByRole("region", { name: "Draft setpoints" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText("Succeeded 4, failed 0, pending 0"),
      ).toBeInTheDocument();
      for (const attribute of ["Setpoint", "Power"]) {
        expect(
          screen.getByRole("link", { name: `History for ${attribute}` }),
        ).toBeInTheDocument();
      }
      expect(
        screen.queryByRole("button", { name: /^Apply/ }),
      ).not.toBeInTheDocument();
      expect(api.devices.confirmCommand).toHaveBeenCalledTimes(2);
      expect(api.devices.previewCommand).toHaveBeenCalledTimes(2);
      cache.clear();
    },
  );

  it("keeps canceled drafts editable and clears them without sending", async () => {
    const cache = setup();
    await stageWithStepper();
    fireEvent.click(screen.getByRole("switch", { name: "Power" }));
    fireEvent.click(screen.getByRole("button", { name: "Review 2 setpoints" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    expect(
      screen.getByRole("button", { name: "Review 2 setpoints" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Choose target: Setpoint" }),
    ).toHaveTextContent("24.0 °C");
    expect(screen.getByRole("switch", { name: "Power" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Increase Setpoint" }));
    expect(
      screen.getByRole("button", { name: "Choose target: Setpoint" }),
    ).toHaveTextContent("24.5 °C");
    expect(api.devices.previewCommand).toHaveBeenCalledTimes(2);
    expectReportedValues();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(
      screen.queryByRole("region", { name: "Draft setpoints" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choose target: Setpoint" }),
    ).toHaveTextContent("22.0 °C");
    expect(screen.getByRole("switch", { name: "Power" })).not.toBeChecked();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.devices.confirmCommand).not.toHaveBeenCalled();
    expectReportedValues();
    cache.clear();
  });

  it("prefills direct entry and removes only the chosen draft", async () => {
    const cache = setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "Choose target: Setpoint" }),
    );
    let dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByRole("spinbutton", {
      name: "Setpoint (°C)",
    });
    expect(input).toHaveValue(22);
    fireEvent.change(input, { target: { value: "24" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add setpoint" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Choose target: Setpoint" }),
    );
    dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("spinbutton", { name: "Setpoint (°C)" }),
    ).toHaveValue(24);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Power" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Setpoint" }));

    const drafts = screen.getByRole("region", { name: "Draft setpoints" });
    expect(within(drafts).queryByText("Setpoint")).not.toBeInTheDocument();
    expect(within(drafts).getByText("Power")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review 1 setpoints" }),
    ).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Power" })).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Choose target: Setpoint" }),
    ).toHaveTextContent("22.0 °C");
    expect(api.devices.previewCommand).not.toHaveBeenCalled();
    expect(api.devices.confirmCommand).not.toHaveBeenCalled();
    expectReportedValues();
    cache.clear();
  });
});
