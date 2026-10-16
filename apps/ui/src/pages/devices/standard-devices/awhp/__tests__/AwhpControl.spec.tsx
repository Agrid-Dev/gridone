import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceType } from "@/lib/devices";
import type { StandardControlProps } from "../../registry";
import { AwhpControl } from "../AwhpControl";

vi.mock("react-i18next", () =>
  createI18nMock({
    "controls.awhp.compressor": "Compresseur",
    "controls.awhp.expansionValve": "Détendeur",
    "controls.awhp.fanCoil": "Ventilateur · batterie",
    "controls.awhp.reversingValve": "Vanne 4 voies",
    "controls.awhp.plateExchanger": "Échangeur à plaques",
    "controls.awhp.waterIn": "Eau entrée",
    "controls.awhp.waterOut": "Eau sortie",
    "controls.awhp.outdoor": "Extérieur",
    "controls.awhp.pressure": "Pression",
    "controls.awhp.dischargeTemperature": "Refoulement T",
    "controls.awhp.dischargePressure": "Refoulement P",
    "controls.awhp.suctionTemperature": "Aspiration T",
    "controls.awhp.suctionPressure": "Aspiration P",
    "controls.awhp.setpoint": "Consigne",
    "controls.awhp.on": "Marche",
    "controls.awhp.off": "Arrêt",
    "controls.awhp.figureLabel": "Cycle frigorifique",
    "common.hvacMode.cool": "Froid",
    "common.hvacMode.heat": "Chauffage",
  }),
);

type AttributeFixture = {
  name: string;
  data_type: string;
  read_write_modes: string[];
  current_value: unknown;
  last_updated: string | null;
  unit?: string | null;
};

function attr(
  name: string,
  data_type: string,
  current_value: unknown,
  unit?: string,
): AttributeFixture {
  return {
    name,
    data_type,
    read_write_modes: ["read"],
    current_value,
    last_updated: null,
    ...(unit ? { unit } : {}),
  };
}

function makeAwhp(
  overrides: Partial<Record<string, AttributeFixture | undefined>> = {},
): Device {
  const defaults: Record<string, AttributeFixture | undefined> = {
    onoff_state: attr("onoff_state", "bool", true),
    unit_run_status: attr("unit_run_status", "string", "running"),
    mode: attr("mode", "string", "cool"),
    inlet_temperature: attr("inlet_temperature", "float", 12.3),
    outlet_temperature: attr("outlet_temperature", "float", 7.1),
    setpoint_temperature: attr("setpoint_temperature", "float", 7.0),
    outdoor_temperature: attr("outdoor_temperature", "float", 15.0),
    compressor_suction_pressure: attr(
      "compressor_suction_pressure",
      "float",
      4.2,
      "bar",
    ),
    compressor_discharge_pressure: attr(
      "compressor_discharge_pressure",
      "float",
      16.8,
    ),
  };
  const attributes = { ...defaults, ...overrides };
  for (const key of Object.keys(attributes)) {
    if (attributes[key] === undefined) delete attributes[key];
  }

  return {
    id: "dev-1",
    name: "Groupe froid GF-01",
    type: DeviceType.Awhp,
    tags: {},
    driver_id: "drv-1",
    transport_id: "tr-1",
    config: {},
    attributes: attributes as Device["attributes"],
    is_faulty: false,
  };
}

function propsOf(device: Device): StandardControlProps {
  return {
    device,
    draft: {},
    savingAttr: null,
    feedback: null,
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
  };
}

function renderControl(device: Device = makeAwhp()) {
  return render(<AwhpControl {...propsOf(device)} />);
}

const drawing = () => screen.getByTestId("awhp-synoptic");
const tag = (sensor: string) =>
  drawing().querySelector(`[data-sensor="${sensor}"]`);
const pipe = (run: string) => drawing().querySelector(`[data-pipe="${run}"]`);
const panel = (piece: string) =>
  drawing().querySelector(`[data-readout="${piece}"]`)!;
const row = (piece: string, label: string) =>
  [...panel(piece).querySelectorAll("[data-row]")].find((r) =>
    r.textContent?.includes(label),
  );

afterEach(cleanup);

describe("AwhpControl", () => {
  it("puts what the drawing does not show on the rail: on/off with the run status, mode, setpoint", () => {
    renderControl();

    expect(screen.getByText("Marche")).toBeInTheDocument();
    expect(screen.getByText("· running")).toBeInTheDocument();
    expect(screen.getByText("Froid")).toBeInTheDocument();
    expect(screen.getByText("Consigne")).toBeInTheDocument();
    expect(screen.getByText("7,0°")).toBeInTheDocument();
  });

  it("drops the setpoint badge when the attribute is absent", () => {
    renderControl(makeAwhp({ setpoint_temperature: undefined }));

    expect(screen.queryByText("Consigne")).not.toBeInTheDocument();
  });

  it("names the parts, hangs the run readings off their run and lists the machines' readings in their panel, with the driver's unit", () => {
    renderControl();

    expect(drawing()).toHaveAccessibleName("Cycle frigorifique");
    expect(drawing()).toHaveTextContent("Ventilateur · batterie");
    expect(drawing()).toHaveTextContent("Vanne 4 voies");
    expect(tag("inlet_t")).toHaveTextContent("Eau entrée");
    // A temperature keeps its degree sign against the number, as the app
    // writes one; a declared unit stands after the value on its own.
    expect(tag("inlet_t")).toHaveTextContent("12,3°");
    expect(tag("inlet_t")!.querySelector("[data-unit]")).toBeNull();
    expect(tag("inlet_t")!.querySelector("[data-leader]")).not.toBeNull();
    expect(tag("outdoor_t")).toHaveTextContent("Extérieur");
    expect(panel("compressor")).toHaveTextContent("Compresseur");
    expect(row("compressor", "Aspiration P")).toHaveTextContent("4,2");
    expect(
      row("compressor", "Aspiration P")!.querySelector("[data-unit]"),
    ).toHaveTextContent("bar");
    // No unit declared and none implied by the name: the number alone.
    expect(row("compressor", "Refoulement P")).toHaveTextContent("16,8");
    expect(
      row("compressor", "Refoulement P")!.querySelector("[data-unit]"),
    ).toBeNull();
    expect(panel("water")).toHaveTextContent("Échangeur à plaques");
  });

  it("draws no tag and no row for a reading the device does not report", () => {
    renderControl(
      makeAwhp({
        compressor_discharge_pressure: undefined,
        inlet_temperature: undefined,
      }),
    );

    expect(row("compressor", "Refoulement P")).toBeUndefined();
    expect(row("compressor", "Aspiration P")).toBeDefined();
    expect(tag("inlet_t")).toBeNull();
    expect(tag("outlet_t")).not.toBeNull();
    // The coil and plate transducers follow the cycle: neither pressure is
    // reported here, so the coil's tag and the plate's row go.
    expect(tag("air_p")).toBeNull();
    expect(row("water", "Pression")).toBeUndefined();
  });

  it("sends the hot gas to the coil when cooling and to the plate when heating, and colours the water as the loop it serves", () => {
    const { rerender } = renderControl();

    expect(drawing()).toHaveAttribute("data-mode", "cool");
    expect(pipe("coil")).toHaveAttribute("data-temperature", "hot");
    expect(pipe("plate")).toHaveAttribute("data-temperature", "cold");
    expect(pipe("discharge")).toHaveAttribute("data-temperature", "hot");
    expect(pipe("waterOut")).toHaveAttribute("data-fluid", "chilled_supply");
    const coolCoilPath = pipe("coil")!
      .querySelector("path[data-casing]")!
      .getAttribute("d");

    // A mode change on the mounted drawing turns the runs round in place.
    rerender(
      <AwhpControl
        {...propsOf(makeAwhp({ mode: attr("mode", "string", "heat") }))}
      />,
    );

    expect(drawing()).toHaveAttribute("data-mode", "heat");
    expect(pipe("coil")).toHaveAttribute("data-temperature", "cold");
    expect(pipe("plate")).toHaveAttribute("data-temperature", "hot");
    expect(pipe("discharge")).toHaveAttribute("data-temperature", "hot");
    expect(pipe("waterOut")).toHaveAttribute("data-fluid", "heating_supply");
    expect(pipe("waterIn")).toHaveAttribute("data-fluid", "heating_return");
    expect(
      pipe("coil")!.querySelector("path[data-casing]")!.getAttribute("d"),
    ).not.toBe(coolCoilPath);
  });

  it("moves the refrigerant and turns the fan only while the unit runs, and updates a mounted reading", () => {
    const { rerender } = renderControl();

    expect(drawing()).toHaveAttribute("data-running");
    expect(drawing().querySelector("[data-fan='on']")).not.toBeNull();
    expect(panel("compressor").querySelector("[data-led='on']")).not.toBeNull();
    expect(pipe("suction")!.querySelector("[data-flow]")).not.toBeNull();
    expect(tag("outlet_t")).toHaveTextContent("7,1");

    rerender(
      <AwhpControl
        {...propsOf(
          makeAwhp({
            onoff_state: attr("onoff_state", "bool", false),
            outlet_temperature: attr("outlet_temperature", "float", 20.5),
          }),
        )}
      />,
    );

    expect(drawing()).not.toHaveAttribute("data-running");
    expect(drawing().querySelector("[data-fan='off']")).not.toBeNull();
    expect(pipe("suction")!.querySelector("[data-flow]")).toBeNull();
    expect(tag("outlet_t")).toHaveTextContent("20,5");
    expect(screen.getByText("Arrêt")).toBeInTheDocument();
  });

  it("paints the fan in the fault colour on a faulty device", () => {
    renderControl({ ...makeAwhp(), is_faulty: true });

    expect(drawing().querySelector("[data-fan='fault']")).not.toBeNull();
  });

  it("renders nothing for a non-AWHP device", () => {
    const device = { ...makeAwhp(), type: DeviceType.Thermostat };
    const { container } = renderControl(device);

    expect(container).toBeEmptyDOMElement();
  });
});
