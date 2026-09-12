import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Device, Driver } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { AGRID_THERMOSTAT_PRESENTATION } from "@/components/device-ui/fixtures/agridThermostat/presentation";
import GroupDetailPage from "./GroupDetailPage";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  getPresentation: vi.fn(),
  getPresentationAsset: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  list: vi.fn(),
  driver: vi.fn(),
  canWrite: true,
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: { groups: api, list: api.list },
    drivers: { get: api.driver },
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => api.canWrite,
}));
vi.mock("react-i18next", () =>
  createI18nMock(
    {
      "groups.chooseTarget": "Choose target",
      "groups.preview": "Preview",
      "groups.cancel": "Cancel",
      "groups.apply": "Apply to {{count}}",
      "groups.values.multiple": "Multiple values",
      "groups.values.partial": "Partially known",
      "groups.values.unavailable": "Unavailable",
      "presentation.increase": "Increase {{name}}",
      "presentation.decrease": "Decrease {{name}}",
    },
    { language: "en" },
  ),
);

const driver = {
  id: "driver",
  attributes: [
    {
      name: "temperature_setpoint",
      data_type: "float",
      unit: "°C",
      read: {},
      write: {},
      write_constraints: { minimum: 16, maximum: 30, step: 0.5 },
    },
    { name: "onoff_state", data_type: "bool", read: {}, write: {} },
    { name: "mode", data_type: "string", read: {}, write: {} },
    { name: "fan_speed", data_type: "string", read: {}, write: {} },
    { name: "temperature", data_type: "float", read: {}, unit: "°C" },
  ],
} as Driver;

function member(id: string, known = true): Device {
  const values = {
    temperature_setpoint: 21,
    temperature: 21.5,
    onoff_state: true,
    mode: "heat",
    fan_speed: "low",
  };
  return {
    id,
    name: id,
    driver_id: driver.id,
    transport_id: "transport",
    config: {},
    attributes: Object.fromEntries(
      driver.attributes.map((attribute) => [
        attribute.name,
        {
          ...attribute,
          current_value: known
            ? values[attribute.name as keyof typeof values]
            : null,
          read_write_modes: attribute.write ? ["read", "write"] : ["read"],
          value_options:
            attribute.name === "mode"
              ? ["heat", "cool", "fan", "auto"]
              : attribute.name === "fan_speed"
                ? ["auto", "low", "medium", "high"]
                : [],
        },
      ]),
    ),
  };
}

function setup() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/devices/groups/group"]}>
        <Routes>
          <Route
            path="/devices/groups/:groupId"
            element={<GroupDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.canWrite = true;
  vi.stubGlobal("createImageBitmap", async () => ({
    width: 800,
    height: 600,
    close() {},
  }));
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:presentation");
  api.get.mockResolvedValue({
    id: "group",
    name: "Thermostats",
    driver_id: driver.id,
    device_ids: ["a", "b"],
  });
  api.driver.mockResolvedValue(driver);
  api.list.mockResolvedValue([member("a"), member("b")]);
  api.getPresentation.mockResolvedValue({
    status: "available",
    revision: "revision",
    document: AGRID_THERMOSTAT_PRESENTATION,
    assets: {},
  });
  api.getPresentationAsset.mockResolvedValue(
    new Blob(["png"], { type: "image/png" }),
  );
  api.preview.mockImplementation(async (_id, body) => ({
    ...body,
    token: "preview-token",
    group_id: "group",
    group_name: "Thermostats",
    members: ["a", "b"].map((id) => ({
      device_id: id,
      name: id,
      eligible: true,
      current_value: null,
    })),
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("group driver presentation", () => {
  it("loads the driver's layout and face and previews a command from its controls", async () => {
    setup();
    const presentation = await screen.findByTestId("device-presentation");
    expect(
      within(presentation).getByText("Setpoints and measurements"),
    ).toBeVisible();
    expect(within(presentation).getByText("Live")).toBeVisible();
    expect(within(presentation).getByTestId("device-face")).toBeVisible();
    expect(
      presentation.querySelector('[data-node="columns"]'),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Power" })).toBeChecked();
    expect(api.getPresentation).toHaveBeenCalledWith("group");
    expect(api.getPresentationAsset).toHaveBeenCalledWith(
      "group",
      "revision",
      "bezel",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Increase Temperature" }),
    );
    await screen.findByRole("dialog");
    expect(api.preview).toHaveBeenCalledWith("group", {
      attribute: "temperature_setpoint",
      value: 21.5,
      target: undefined,
    });
    expect(api.confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      within(presentation).getByRole("button", {
        name: "Choose target: Temperature",
      }),
    ).toHaveTextContent("21.0 °C");
  });

  it.each(["multiple", "partial", "unavailable"] as const)(
    "keeps the driver's widgets for %s values and previews explicit targets",
    async (state) => {
      const a = member("a", state !== "unavailable");
      const b = member("b", state === "multiple");
      if (state === "multiple") {
        b.attributes!.temperature_setpoint.current_value = 23;
        b.attributes!.onoff_state.current_value = false;
        b.attributes!.mode.current_value = "cool";
        b.attributes!.fan_speed.current_value = "high";
      }
      api.list.mockResolvedValue([a, b]);
      setup();
      await screen.findByTestId("device-face");
      expect(
        screen.getByRole("button", { name: "Increase Temperature" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Decrease Temperature" }),
      ).toBeDisabled();
      const modes = screen.getByRole("radiogroup", { name: "Mode" });
      expect(within(modes).getAllByRole("radio")).toHaveLength(4);
      for (const option of within(modes).getAllByRole("radio"))
        expect(option).not.toBeChecked();
      expect(
        within(
          screen.getByRole("radiogroup", { name: "Fan speed" }),
        ).getAllByRole("radio"),
      ).toHaveLength(4);
      fireEvent.click(within(modes).getByRole("radio", { name: "Cool" }));
      await screen.findByRole("dialog");
      expect(api.preview).toHaveBeenLastCalledWith("group", {
        attribute: "mode",
        value: "cool",
        target: undefined,
      });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(
        within(modes).getByRole("radio", { name: "Cool" }),
      ).not.toBeChecked();

      const power = screen.getByRole("checkbox", { name: "Power" });
      expect(power).toBePartiallyChecked();
      fireEvent.click(power);
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "false" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Preview" }));
      await screen.findByRole("button", { name: "Apply to 2" });
      expect(api.preview).toHaveBeenLastCalledWith("group", {
        attribute: "onoff_state",
        value: false,
        target: undefined,
      });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      fireEvent.click(
        screen.getByRole("button", { name: "Choose target: Temperature" }),
      );
      fireEvent.change(screen.getByRole("spinbutton"), {
        target: { value: "22" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Preview" }));
      await screen.findByRole("button", { name: "Apply to 2" });
      expect(api.preview).toHaveBeenLastCalledWith("group", {
        attribute: "temperature_setpoint",
        value: 22,
        target: undefined,
      });
      expect(api.confirm).not.toHaveBeenCalled();
    },
  );

  it("keeps the same presentation for viewers with all commands disabled", async () => {
    api.canWrite = false;
    setup();
    await screen.findByTestId("device-face");
    expect(screen.getByRole("switch", { name: "Power" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Choose target: Temperature" }),
    ).toBeDisabled();
    for (const option of screen.getAllByRole("radio"))
      expect(option).toBeDisabled();
    expect(api.preview).not.toHaveBeenCalled();
  });
});
