import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { DevicePresentation } from "../DevicePresentation";
import type { PresentationV1 } from "../document";
import type { Scalar } from "../conditions";
import type {
  AttributeLike,
  BoundControlState,
  DeviceUiRuntime,
} from "../runtime";
import { AGRID_THERMOSTAT_GLYPH_SETS } from "../fixtures/agridThermostat";

vi.mock("react-i18next", () =>
  createI18nMock(
    {
      "presentation.sending": "Sending…",
      "presentation.confirmed": "Applied",
      "presentation.error": "Failed: {{message}}",
      "presentation.unconfirmed": "Not confirmed: {{message}}",
      "presentation.unavailable": "Unavailable",
      "presentation.increase": "Increase {{name}}",
      "presentation.decrease": "Decrease {{name}}",
      "presentation.range": "{{min}} – {{max}}",
      "presentation.sectionSettings": "{{count}} settings",
      "presentation.sectionValues": "{{count}} values",
      "presentation.sectionItems": "{{count}} items",
      "presentation.demanded": "Demanded",
      "presentation.regulated": "Regulated",
      "presentation.measured": "Measured",
      "presentation.deviation": "Deviation",
      "presentation.withinTolerance": "within tolerance",
      "presentation.outOfTolerance": "out of tolerance",
    },
    { language: "en" },
  ),
);

afterEach(cleanup);

const attributes: Record<string, AttributeLike> = {
  temperature_setpoint: {
    name: "temperature_setpoint",
    data_type: "float",
    read_write_modes: ["read", "write"],
    current_value: 21,
    unit: "°C",
    write_constraints: { step: 0.5, minimum: 16, maximum: 30 },
  },
  setpoint_effective: {
    name: "setpoint_effective",
    data_type: "float",
    read_write_modes: ["read"],
    current_value: 17,
    unit: "°C",
  },
  temperature: {
    name: "temperature",
    data_type: "float",
    read_write_modes: ["read"],
    current_value: 21.4,
    unit: "°C",
    group: "sensors",
  },
  humidity: {
    name: "humidity",
    data_type: "float",
    read_write_modes: ["read"],
    current_value: null,
    unit: "%",
    group: "sensors",
  },
  onoff_state: {
    name: "onoff_state",
    data_type: "bool",
    read_write_modes: ["read", "write"],
    current_value: true,
  },
  fan_speed: {
    name: "fan_speed",
    data_type: "string",
    read_write_modes: ["read", "write"],
    current_value: "low",
    value_options: ["low", "high"],
  },
};

const device = {
  id: "dev-1",
  name: "Thermostat",
  type: "thermostat",
  attributes,
} as unknown as Device;

const document: PresentationV1 = {
  schema_version: 1,
  requires: ["layout/1", "controls/1", "measurements/1", "setpoint-table/1"],
  assets: {},
  bindings: {
    target: { attribute: "temperature_setpoint" },
    regulated: { attribute: "setpoint_effective" },
    measured: { attribute: "temperature" },
    humidity: { attribute: "humidity" },
    power: { attribute: "onoff_state" },
    fan: { attribute: "fan_speed" },
  },
  controls: {
    target: {
      kind: "number",
      binding: "target",
      label: { default: "Setpoint" },
    },
    power: { kind: "toggle", binding: "power", label: { default: "Power" } },
    fan: { kind: "select", binding: "fan", label: { default: "Fan" } },
  },
  page: {
    kind: "columns",
    items: [
      {
        weight: 2,
        content: {
          kind: "section",
          title: { default: "Setpoints", translations: { fr: "Consignes" } },
          children: [
            {
              kind: "setpoint-table",
              rows: [
                {
                  label: { default: "Temperature" },
                  demanded: { control: "target" },
                  regulated: { binding: "regulated" },
                  measured: { binding: "measured" },
                  deviation: {
                    minuend: "measured",
                    subtrahend: "target",
                    tolerance: 0.5,
                  },
                  formatter: { decimals: 1 },
                },
              ],
            },
            { kind: "control-panel", controls: ["power", "fan"] },
          ],
        },
      },
      {
        weight: 1,
        content: {
          kind: "stack",
          children: [
            {
              kind: "measurements",
              items: [
                { binding: "measured", formatter: { decimals: 1 } },
                {
                  binding: "humidity",
                  formatter: {
                    decimals: 0,
                    unavailable: { default: "sensor not connected" },
                  },
                },
              ],
            },
            { kind: "attributes", group: "diagnostic" },
            {
              kind: "device-face",
              label: { default: "Face" },
              view_box: { width: 100, height: 50 },
              layers: [
                {
                  kind: "glyph-text",
                  glyph_set: "montserrat",
                  anchor: {
                    box: { x: 0, y: 0, width: 100, height: 50 },
                    align: "center",
                  },
                  text: [{ number: { binding: "target", decimals: 1 } }],
                  color: "#ffffff",
                },
                {
                  kind: "button",
                  box: { x: 0, y: 0, width: 50, height: 50 },
                  label: { default: "Increase" },
                  action: { control: "target", op: "increment" },
                },
              ],
            },
          ],
        },
      },
    ],
  },
};

/** A runtime whose displayed setpoint is an intention ahead of the report. */
function fakeRuntime(
  overrides: Partial<Record<string, Partial<BoundControlState>>> = {},
) {
  const activate = vi.fn();
  const setValue = vi.fn();
  const reported = (name: string): Scalar | null =>
    attributes[name]?.current_value ?? null;
  const base = (id: string): BoundControlState => {
    const spec = document.controls[id];
    const attribute = attributes[document.bindings[spec.binding].attribute];
    return {
      spec: { kind: spec.kind, attribute: attribute.name, label: spec.label },
      attribute,
      reported: attribute.current_value,
      displayed: attribute.current_value,
      writable: true,
      write: { kind: "idle" },
      pending: false,
      constraints: { step: 0.5, minimum: 16, maximum: 30, unknown: false },
      options: attribute.value_options ?? [],
      canIncrement: spec.kind === "number",
      canDecrement: spec.kind === "number",
      canToggle: spec.kind === "toggle",
      canCycle: spec.kind === "select",
      ...overrides[id],
    };
  };
  const runtime: DeviceUiRuntime = {
    readControl: (id) => (document.controls[id] ? base(id) : undefined),
    setValue,
    activate,
    reported,
  };
  return { runtime, activate, setValue };
}

function renderPresentation(
  runtime: DeviceUiRuntime,
  extra: Partial<Parameters<typeof DevicePresentation>[0]> = {},
) {
  return render(
    <DevicePresentation
      document={document}
      device={device}
      runtime={runtime}
      assetUrl={() => undefined}
      glyphSet={(id) => AGRID_THERMOSTAT_GLYPH_SETS[id]}
      fallback={<p>standard view</p>}
      renderAttributes={({ group }) => <p>attributes of {group}</p>}
      {...extra}
    />,
  );
}

describe("DevicePresentation", () => {
  it("folds nested plain sections independently and keeps their state on live updates", async () => {
    const user = userEvent.setup();
    const { runtime } = fakeRuntime();
    const nested: PresentationV1 = {
      ...document,
      page: {
        kind: "section",
        title: { default: "Settings" },
        collapsible: true,
        collapsed: true,
        show_count: true,
        children: [
          {
            kind: "section",
            title: { default: "Display" },
            appearance: "plain",
            collapsible: true,
            show_count: true,
            children: [{ kind: "control-panel", controls: ["power"] }],
          },
        ],
      },
    };
    const { rerender } = renderPresentation(runtime, { document: nested });
    const parent = screen.getByText("Settings").closest("summary")!;
    const child = screen.getByText("Display").closest("summary")!;
    expect(parent.parentElement).not.toHaveAttribute("open");
    expect(child.parentElement).toHaveAttribute("open");
    expect(child.closest('[data-node="section"]')).toHaveAttribute(
      "data-appearance",
      "plain",
    );
    expect(within(parent).getByText("1 settings")).toBeInTheDocument();
    await user.click(parent);
    expect(screen.getByRole("switch", { name: "Power" })).toBeVisible();
    await user.click(child);
    await user.click(parent);
    await user.click(parent);
    expect(child.parentElement).not.toHaveAttribute("open");
    rerender(
      <DevicePresentation
        document={nested}
        device={{ ...device }}
        runtime={runtime}
        assetUrl={() => undefined}
        glyphSet={() => undefined}
        fallback={null}
      />,
    );
    expect(parent.parentElement).toHaveAttribute("open");
    expect(child.parentElement).not.toHaveAttribute("open");
    rerender(
      <DevicePresentation
        document={nested}
        device={{ ...device, id: "dev-2" }}
        runtime={runtime}
        assetUrl={() => undefined}
        glyphSet={() => undefined}
        fallback={null}
      />,
    );
    expect(screen.getByText("Settings").closest("details")).not.toHaveAttribute(
      "open",
    );
    expect(screen.getByText("Display").closest("details")).toHaveAttribute(
      "open",
    );
  });

  it.each(["rows", "inline"] as const)(
    "renders %s measurements in authored order without group headings",
    (layout) => {
      const { runtime } = fakeRuntime();
      const { container } = renderPresentation(runtime, {
        document: {
          ...document,
          page: {
            kind: "measurements",
            layout,
            items: [
              {
                binding: "humidity",
                formatter: { unavailable: { default: "No sensor" } },
              },
              { binding: "power" },
              { binding: "measured", formatter: { decimals: 1 } },
            ],
          },
        },
      });
      expect(screen.queryByText("Sensors")).not.toBeInTheDocument();
      expect(screen.getByText("No sensor")).toBeInTheDocument();
      expect(screen.getByText("21.4 °C")).toBeInTheDocument();
      expect(
        Array.from(container.querySelectorAll("[data-binding]")).map((row) =>
          row.getAttribute("data-binding"),
        ),
      ).toEqual(["humidity", "power", "measured"]);
    },
  );

  it("shows the slider value and forwards drag changes through the runtime", () => {
    const { runtime, setValue } = fakeRuntime({
      target: {
        spec: {
          kind: "slider",
          attribute: "temperature_setpoint",
          label: { default: "Target" },
        },
      },
    });
    renderPresentation(runtime, {
      document: {
        ...document,
        page: { kind: "control-panel", controls: ["target"] },
      },
    });
    const slider = screen.getByRole("slider", { name: "Target" });
    expect(slider).toHaveAttribute("aria-valuetext", "21.0 °C");
    expect(slider).toHaveAttribute("min", "16");
    expect(slider).toHaveAttribute("max", "30");
    expect(slider).toHaveAttribute("step", "0.5");
    fireEvent.change(slider, { target: { value: "22.5" } });
    expect(setValue).toHaveBeenCalledWith("target", 22.5);
  });

  it.each([
    { writable: false },
    { displayed: null },
    { constraints: { step: 0.5, minimum: null, maximum: 30, unknown: true } },
    { constraints: { step: null, minimum: 16, maximum: 30, unknown: false } },
  ])("disables a slider when unavailable: %j", (override) => {
    const { runtime } = fakeRuntime({
      target: {
        spec: {
          kind: "slider",
          attribute: "temperature_setpoint",
          label: { default: "Target" },
        },
        ...override,
      },
    });
    renderPresentation(runtime, {
      document: {
        ...document,
        page: { kind: "control-panel", controls: ["target"] },
      },
    });
    expect(screen.getByRole("slider")).toBeDisabled();
  });

  it("renders the page tree with sections, controls, measurements and the attributes slot", () => {
    const { runtime } = fakeRuntime();
    renderPresentation(runtime);
    expect(screen.getByText("Setpoints")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Power" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
    expect(screen.getByText("attributes of diagnostic")).toBeInTheDocument();
    // Measurements: formatted with the attribute unit; unknown → the row's text.
    const inList = screen
      .getAllByText("21.4 °C")
      .filter((element) => element.closest("dl") !== null);
    expect(inList).toHaveLength(1);
    expect(screen.getByText("sensor not connected")).toBeInTheDocument();
    expect(screen.getByText("Sensors")).toBeInTheDocument();
  });

  it("computes the deviation against the tolerance and shows the demanded stepper", async () => {
    const user = userEvent.setup();
    const { runtime, activate } = fakeRuntime();
    renderPresentation(runtime);
    const row = screen.getByRole("row", { name: /Temperature/ });
    expect(within(row).getByText("17.0 °C")).toBeInTheDocument();
    expect(within(row).getByText("21.4 °C")).toBeInTheDocument();
    const deviation = within(row).getByText(/\+0\.4 °C/);
    expect(deviation).toHaveAttribute("data-deviation", "ok");
    await user.click(
      within(row).getByRole("button", { name: "Increase Temperature" }),
    );
    expect(activate).toHaveBeenCalledWith({
      control: "target",
      op: "increment",
    });
  });

  it("uses driver attribute labels when a measurement has no explicit label", () => {
    const { runtime } = fakeRuntime();
    renderPresentation(runtime, {
      device: {
        ...device,
        attributes: {
          ...device.attributes,
          temperature: {
            ...attributes.temperature,
            label: {
              default: "Room sensor",
              translations: { en: "Ambient temperature" },
            },
          },
        },
      } as Device,
    });
    expect(screen.getByText("Ambient temperature")).toBeInTheDocument();
  });

  it.each([
    [0.25, 21.25, "21.25 °C"],
    [2.5e-7, 1.25e-6, "0.00000125 °C"],
  ])("displays the full precision of a %s step", (step, displayed, text) => {
    const { runtime } = fakeRuntime({
      target: {
        displayed,
        constraints: { step, minimum: null, maximum: null, unknown: false },
      },
    });
    renderPresentation(runtime);
    const row = screen.getByRole("row", { name: /Temperature/ });
    expect(within(row).getByText(text)).toBeInTheDocument();
  });

  it("shows the write state of the demanded control inside the table", () => {
    const { runtime } = fakeRuntime({
      target: {
        write: { kind: "unconfirmed", requested: 22, message: "no echo" },
      },
    });
    renderPresentation(runtime);
    const row = screen.getByRole("row", { name: /Temperature/ });
    expect(within(row).getByRole("status")).toHaveAttribute(
      "data-write-state",
      "unconfirmed",
    );
  });

  it("flags a deviation beyond the tolerance", () => {
    const { runtime } = fakeRuntime();
    attributes.temperature.current_value = 23;
    try {
      renderPresentation(runtime);
      expect(screen.getByText(/\+2\.0 °C/)).toHaveAttribute(
        "data-deviation",
        "out",
      );
    } finally {
      attributes.temperature.current_value = 21.4;
    }
  });

  it("supports native radio keyboard navigation between declared options", async () => {
    const user = userEvent.setup();
    const { runtime, setValue } = fakeRuntime();
    renderPresentation(runtime);
    await user.click(screen.getByRole("radio", { name: "Low" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "High" })).toHaveFocus();
    expect(setValue).toHaveBeenCalledWith("fan", "high");
  });

  it("shows the write state and forwards control changes to the runtime", async () => {
    const user = userEvent.setup();
    const { runtime, setValue } = fakeRuntime({
      power: { write: { kind: "sending", requested: false } },
      fan: { write: { kind: "error", requested: "high", message: "refused" } },
    });
    renderPresentation(runtime);
    expect(screen.getByText("Sending…")).toHaveAttribute("role", "status");
    expect(screen.getByText("Failed: refused")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "High" }));
    expect(setValue).toHaveBeenCalledWith("fan", "high");
    await user.click(screen.getByRole("switch", { name: "Power" }));
    expect(setValue).toHaveBeenCalledWith("power", false);
  });

  it("feeds the face the displayed value of a controlled binding and routes its actions", async () => {
    const user = userEvent.setup();
    const { runtime, activate } = fakeRuntime({ target: { displayed: 22.5 } });
    renderPresentation(runtime);
    expect(document.page.kind).toBe("columns");
    expect(screen.getByRole("img", { name: "22.5" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Increase" }));
    expect(activate).toHaveBeenLastCalledWith({
      control: "target",
      op: "increment",
    });
  });

  it("falls back to the standard content when rendering throws", () => {
    const { runtime } = fakeRuntime();
    const onRenderError = vi.fn();
    const broken: DeviceUiRuntime = {
      ...runtime,
      readControl: () => {
        throw new Error("boom");
      },
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      renderPresentation(broken, { onRenderError });
    } finally {
      errorSpy.mockRestore();
    }
    expect(screen.getByText("standard view")).toBeInTheDocument();
    expect(onRenderError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "boom" }),
    );
  });
});
