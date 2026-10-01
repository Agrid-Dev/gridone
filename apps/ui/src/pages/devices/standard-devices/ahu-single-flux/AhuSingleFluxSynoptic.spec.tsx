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
import { AhuSingleFluxSynoptic } from "./AhuSingleFluxSynoptic";
import type { AhuSingleFluxValues } from "./types";

vi.mock("react-i18next", () =>
  createI18nMock({
    "ahu_single_flux.name": "Single-flux AHU",
    "ahu.synoptic.freshAir": "Fresh air",
    "ahu.synoptic.supplyAir": "Supply air",
    "ahu.synoptic.extractAir": "Extract air",
    "ahu.synoptic.exhaustAir": "Exhaust air",
    "ahu.synoptic.filter": "Filter",
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
    "ahu.synoptic.supplyAirPressureSetpoint": "Supply pressure",
    "ahu.synoptic.editSetpoint": "Edit setpoint",
    "ahu.synoptic.editSetpointDescription": "Set a new value for {{label}}.",
    "ahu.synoptic.invalidNumber": "Invalid number",
    "common.edit": "Edit",
    "common.save": "Save",
    "common.cancel": "Cancel",
  }),
);

// A typical unit: heating coil only, temperature setpoint only.
const VALUES: AhuSingleFluxValues = {
  supplyAirTemperature: 15.9,
  supplyAirTemperatureSetpoint: 16,
  supplyFanSpeed: 45,
  onoffState: true,
  supplyAirPressure: 2,
  outdoorAirTemperature: 14.8,
  heatingValve: 30,
};

afterEach(cleanup);

describe("AhuSingleFluxSynoptic", () => {
  it("reads the streams, fan speed and valve opening of the supply run", () => {
    render(<AhuSingleFluxSynoptic values={VALUES} />);

    expect(screen.getByText("14,8°")).toBeInTheDocument();
    expect(screen.getByText("15,9°")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("45 %")).toBeInTheDocument();
    expect(screen.getByText("30 %")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    // Supply only: no extract run.
    expect(
      screen.queryByText("Extract fan", { selector: "title" }),
    ).not.toBeInTheDocument();
  });

  it("adds the extract run when the unit reports its extract side", () => {
    render(
      <AhuSingleFluxSynoptic
        values={{ ...VALUES, extractAirTemperature: 21.2, extractFanSpeed: 40 }}
      />,
    );

    expect(
      screen.getByText("Extract fan", { selector: "title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("21,2°")).toBeInTheDocument();
    expect(screen.getByText("40 %")).toBeInTheDocument();
    // No exchanger, so the exhaust is the extract air: named, not measured.
    expect(screen.getByText("Exhaust air")).toBeInTheDocument();
  });

  it("reads a small negative pressure as zero, not minus zero", () => {
    render(
      <AhuSingleFluxSynoptic values={{ ...VALUES, supplyAirPressure: -0.4 }} />,
    );

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("-0")).not.toBeInTheDocument();
  });

  it("renders missing values as placeholders without setpoints", () => {
    render(<AhuSingleFluxSynoptic values={{}} />);

    // The required supply temperature and the fan speed.
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("Fresh air")).toBeInTheDocument();
    expect(screen.queryByText("Setpoint")).not.toBeInTheDocument();
  });

  it("renders coils only for the valve attributes the device exposes", () => {
    render(<AhuSingleFluxSynoptic values={VALUES} />);

    expect(
      screen.getAllByText("Heating coil", { selector: "title" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("Cooling coil", { selector: "title" }),
    ).not.toBeInTheDocument();
  });

  it("edits a writable setpoint in place, through the modal", async () => {
    const user = userEvent.setup();
    const onSetpointSave = vi.fn();
    render(
      <AhuSingleFluxSynoptic
        values={VALUES}
        writableSetpoints={["supplyAirTemperatureSetpoint"]}
        onSetpointSave={onSetpointSave}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Edit Supply temperature" }),
    );
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(16);

    // userEvent.clear/type don't support number inputs in jsdom.
    fireEvent.change(input, { target: { value: "17.5" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSetpointSave).toHaveBeenCalledWith(
        "supplyAirTemperatureSetpoint",
        17.5,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
