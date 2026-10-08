import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createI18nMock } from "@/test/i18nMock";
import { AHU_CONVENTION_UNITS } from "../ahu-shared";
import { AhuDoubleFluxSynoptic } from "./AhuDoubleFluxSynoptic";
import type { AhuDoubleFluxValues } from "./types";

vi.mock("react-i18next", () =>
  createI18nMock({
    "ahu_double_flux.name": "Double-flux AHU",
    "ahu.synoptic.freshAir": "Fresh air",
    "ahu.synoptic.exhaustAir": "Exhaust air",
    "ahu.synoptic.extractAir": "Extract air",
    "ahu.synoptic.supplyAir": "Supply air",
    "ahu.synoptic.exchanger": "Heat exchanger",
    "ahu.synoptic.efficiency": "Efficiency",
    "ahu.synoptic.filter": "Filter",
    "ahu.synoptic.prefilter": "Pre-filter",
    "ahu.synoptic.filterClean": "Clean",
    "ahu.synoptic.filterClogged": "Clogged",
    "ahu.synoptic.damper": "Damper",
    "ahu.synoptic.freshAirDamper": "Fresh air damper",
    "ahu.synoptic.supplyDamper": "Supply damper",
    "ahu.synoptic.damperOpen": "Open",
    "ahu.synoptic.damperClosed": "Closed",
    "ahu.synoptic.flowProven": "Airflow proven",
    "ahu.synoptic.flowMissing": "No airflow",
    "ahu.synoptic.heatingLoop": "Heating coil water loop",
    "ahu.synoptic.coolingLoop": "Cooling coil water loop",
    "ahu.synoptic.valve": "Valve",
    "ahu.synoptic.waterFlow": "Flow",
    "ahu.synoptic.waterSupply": "Water in",
    "ahu.synoptic.waterReturn": "Water out",
    "ahu.synoptic.power": "Power",
    "ahu.synoptic.energy": "Energy",
    "ahu.synoptic.flow": "Air flow",
    "ahu.synoptic.humidity": "Humidity",
    "ahu.synoptic.co2": "CO₂",
    "ahu.synoptic.heatingCoil": "Heating coil",
    "ahu.synoptic.coolingCoil": "Cooling coil",
    "ahu.synoptic.heating": "Heating",
    "ahu.synoptic.cooling": "Cooling",
    "ahu.synoptic.supplyFan": "Supply fan",
    "ahu.synoptic.extractFan": "Extract fan",
    "ahu.synoptic.supplyFanShort": "Supply fan",
    "ahu.synoptic.extractFanShort": "Extract fan",
    "ahu.synoptic.temperature": "Temperature",
    "ahu.synoptic.pressure": "Pressure",
    "ahu.synoptic.setpoint": "Setpoint",
    "ahu.synoptic.on": "Running",
    "ahu.synoptic.off": "Stopped",
    "ahu.synoptic.supplyAirTemperatureSetpoint": "Supply temperature",
    "ahu.synoptic.supplyAirTemperatureCoolingSetpoint":
      "Supply cooling temperature",
    "ahu.synoptic.supplyAirFlowSetpoint": "Supply air flow",
    "ahu.synoptic.extractAirFlowSetpoint": "Extract air flow",
    "ahu.synoptic.supplyAirPressureSetpoint": "Supply pressure",
    "ahu.synoptic.extractAirPressureSetpoint": "Extract pressure",
    "ahu.synoptic.editSetpoint": "Edit setpoint",
    "ahu.synoptic.editSetpointDescription": "Set a new value for {{label}}.",
    "ahu.synoptic.invalidNumber": "Invalid number",
    "common.edit": "Edit",
    "common.save": "Save",
    "common.cancel": "Cancel",
  }),
);

const VALUES: AhuDoubleFluxValues = {
  supplyAirTemperature: 17.8,
  supplyAirTemperatureSetpoint: 18,
  supplyFanSpeed: 55,
  extractAirTemperature: 22.3,
  extractFanSpeed: 70,
  onoffState: true,
  supplyAirPressure: 79,
  extractAirPressure: 82,
  extractAirPressureSetpoint: 80,
  outdoorAirTemperature: 15.7,
  exhaustAirTemperature: 16.4,
  exchangerUtilization: 64,
};

afterEach(cleanup);

describe("AhuDoubleFluxSynoptic", () => {
  it("reads every stream, fan and the exchanger in the current locale", () => {
    render(<AhuDoubleFluxSynoptic values={VALUES} />);

    // Temperatures to one decimal (fr: comma), pressures to none.
    for (const text of ["17,8°", "22,3°", "15,7°", "16,4°", "79", "82"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText("55 %")).toBeInTheDocument();
    expect(screen.getByText("70 %")).toBeInTheDocument();
    expect(screen.getByText("64 %")).toBeInTheDocument();
  });

  it("appends the driver's unit to a reading when it declares one", () => {
    render(
      <AhuDoubleFluxSynoptic
        values={VALUES}
        units={{ supplyAirPressure: "Pa", supplyAirTemperature: "°C" }}
      />,
    );

    expect(screen.getByText("79 Pa")).toBeInTheDocument();
    expect(screen.getByText("17,8 °C")).toBeInTheDocument();
  });

  it("spins each fan with its stream: supply clockwise, extract counter-clockwise", () => {
    const { container } = render(<AhuDoubleFluxSynoptic values={VALUES} />);

    const fans = container.querySelectorAll("[data-spinning='true']");
    expect(fans).toHaveLength(2);
    expect(
      container.querySelector("[data-spin='ccw']")?.querySelector("title")
        ?.textContent,
    ).toBe("Extract fan");
  });

  it("names a stream the unit does not measure and dashes a required one it does not report", () => {
    render(
      <AhuDoubleFluxSynoptic
        values={{ supplyFanSpeed: 0, extractFanSpeed: 0 }}
      />,
    );

    // Optional streams fall back to a caption, no dash.
    expect(screen.getByText("Fresh air")).toBeInTheDocument();
    expect(screen.getByText("Exhaust air")).toBeInTheDocument();
    // Supply and extract temperatures are required: dashed, not hidden.
    expect(screen.getAllByText("—")).toHaveLength(3); // 2 streams + exchanger
    expect(screen.queryByText("Setpoint")).not.toBeInTheDocument();
  });

  it("edits a writable setpoint in place, through the modal", async () => {
    const user = userEvent.setup();
    const onSetpointSave = vi.fn();
    render(
      <AhuDoubleFluxSynoptic
        values={VALUES}
        writableSetpoints={["supplyAirTemperatureSetpoint"]}
        onSetpointSave={onSetpointSave}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Edit Supply temperature" }),
    );
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(18);

    // userEvent.clear/type don't support number inputs in jsdom.
    fireEvent.change(input, { target: { value: "19.5" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSetpointSave).toHaveBeenCalledWith(
        "supplyAirTemperatureSetpoint",
        19.5,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("offers the editor for a writable setpoint the unit does not read back", () => {
    render(
      <AhuDoubleFluxSynoptic
        values={{ ...VALUES, supplyAirPressureSetpoint: undefined }}
        writableSetpoints={["supplyAirPressureSetpoint"]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Edit Supply pressure" }),
    ).toBeInTheDocument();
  });

  it("renders coils only for the valve attributes the device exposes", () => {
    render(<AhuDoubleFluxSynoptic values={{ ...VALUES, coolingValve: 65 }} />);

    expect(
      screen.getAllByText("Cooling coil", { selector: "title" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("Heating coil", { selector: "title" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("65 %")).toBeInTheDocument();
  });

  it("renders non-writable setpoints read-only, next to their measure", () => {
    render(<AhuDoubleFluxSynoptic values={VALUES} />);

    // The supply temperature and extract pressure setpoints, no buttons.
    expect(screen.getAllByText("Setpoint")).toHaveLength(2);
    expect(screen.getByText("18,0°")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("colours a clogged filter stage and names the verdict under it", () => {
    const { container } = render(
      <AhuDoubleFluxSynoptic
        values={{
          ...VALUES,
          supplyPrefilterClogged: false,
          supplyFilterClogged: true,
          extractFilterClogged: false,
        }}
      />,
    );

    expect(container.querySelectorAll("[data-clogged='true']")).toHaveLength(1);
    expect(screen.getByText("Clogged")).toHaveClass("fill-status-error");
    expect(screen.getByText("Clean")).toBeInTheDocument();
    expect(
      screen.getByText("Pre-filter", { selector: "title" }),
    ).toBeInTheDocument();
  });

  it("reads a measured filter pressure drop instead of the switch verdict", () => {
    render(
      <AhuDoubleFluxSynoptic
        values={{ ...VALUES, supplyFilterDifferentialPressure: 120 }}
        units={{ supplyFilterDifferentialPressure: "Pa" }}
      />,
    );

    expect(screen.getByText("120 Pa")).toBeInTheDocument();
    expect(screen.queryByText("Clean")).not.toBeInTheDocument();
  });

  it("draws the dampers the unit reports, in their limit-switch state", () => {
    const { container } = render(
      <AhuDoubleFluxSynoptic
        values={{
          ...VALUES,
          outdoorAirDamperOpen: true,
          supplyAirDamperOpen: false,
        }}
      />,
    );

    expect(container.querySelector("[data-open='true']")?.textContent).toBe(
      "Fresh air damper",
    );
    expect(container.querySelector("[data-open='false']")?.textContent).toBe(
      "Supply damper",
    );
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("trusts the flow switch over the fan signal for the airflow", () => {
    const { container } = render(
      <AhuDoubleFluxSynoptic
        values={{ ...VALUES, supplyFlowSwitch: false, extractFlowSwitch: true }}
      />,
    );

    // The supply fan reports 55 % but proves no air: still, not spinning.
    expect(container.querySelectorAll("[data-spinning='true']")).toHaveLength(
      1,
    );
    expect(screen.getByText("No airflow")).toHaveClass("fill-status-warning");
    expect(screen.getByText("Airflow proven")).toHaveClass("fill-status-ok");
  });

  it("lists a coil's water loop under it when its hydraulics are measured", () => {
    const { container } = render(
      <AhuDoubleFluxSynoptic
        values={{
          ...VALUES,
          heatingValve: 80,
          heatingWaterFlow: 0.28,
          heatingWaterSupplyTemperature: 54.2,
          heatingWaterReturnTemperature: 41.7,
          heatingPower: 14600,
          heatingEnergy: 70805,
          coolingValve: 0,
        }}
        units={{
          ...AHU_CONVENTION_UNITS,
          heatingWaterFlow: "l/s",
          heatingPower: "W",
          heatingEnergy: "kWh",
        }}
      />,
    );

    for (const text of [
      "0,28 l/s",
      "54,2°",
      "41,7°",
      "14 600 W",
      "70 805 kWh",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    // The heating loop circulates (valve open); the cooling coil has no
    // measured loop and keeps its plain valve readout.
    expect(container.querySelector("[data-active='true']")?.textContent).toBe(
      "Heating coil water loop",
    );
    expect(screen.getByText("Cooling")).toBeInTheDocument();
    expect(screen.getByText("0 %")).toBeInTheDocument();
  });

  it("pairs the heating and cooling setpoints of a dead-band supply temperature", async () => {
    const user = userEvent.setup();
    const onSetpointSave = vi.fn();
    render(
      <AhuDoubleFluxSynoptic
        values={{ ...VALUES, supplyAirTemperatureCoolingSetpoint: 24 }}
        writableSetpoints={["supplyAirTemperatureCoolingSetpoint"]}
        onSetpointSave={onSetpointSave}
      />,
    );

    expect(screen.getByText("Heating")).toBeInTheDocument();
    expect(screen.getByText("Cooling")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Edit Supply cooling temperature" }),
    );
    expect(screen.getByRole("spinbutton")).toHaveValue(24);
  });

  it("adds the air flow, humidity and CO₂ rows a unit reports to its streams", () => {
    render(
      <AhuDoubleFluxSynoptic
        values={{
          ...VALUES,
          supplyAirFlow: 4200,
          supplyAirFlowSetpoint: 4000,
          extractAirHumidity: 58,
          extractAirCo2: 640,
          exchangerEfficiency: 71,
        }}
        units={{
          ...AHU_CONVENTION_UNITS,
          supplyAirFlow: "m³/h",
          extractAirCo2: "ppm",
        }}
      />,
    );

    expect(screen.getByText("4 200 m³/h")).toBeInTheDocument();
    expect(screen.getByText("4 000")).toBeInTheDocument();
    expect(screen.getByText("58 %")).toBeInTheDocument();
    expect(screen.getByText("640 ppm")).toBeInTheDocument();
    expect(screen.getByText("71 %")).toBeInTheDocument();
  });
});
