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
    "ahu.synoptic.filter": "Filter",
    "ahu.synoptic.heatingCoil": "Heating coil",
    "ahu.synoptic.coolingCoil": "Cooling coil",
    "ahu.synoptic.supplyFan": "Supply fan",
    "ahu.synoptic.on": "Running",
    "ahu.synoptic.off": "Stopped",
    "ahu.synoptic.setpoints": "Setpoints",
    "ahu.synoptic.supplyAirTemperatureSetpoint": "Supply temperature",
    "ahu.synoptic.supplyAirPressureSetpoint": "Supply pressure",
    "ahu.synoptic.editSetpoint": "Edit setpoint",
    "ahu.synoptic.editSetpointDescription": "Set a new value for {{label}}.",
    "ahu.synoptic.invalidNumber": "Invalid number",
    "common.edit": "Edit",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.readOnly": "Read only",
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
  it("renders air measurements, fan speed and valve position", () => {
    render(<AhuSingleFluxSynoptic values={VALUES} />);

    expect(screen.getByText("14.8°")).toBeInTheDocument();
    expect(screen.getByText("15.9° · 2")).toBeInTheDocument();
    expect(screen.getByText("45 %")).toBeInTheDocument();
    expect(screen.getByText("30 %")).toBeInTheDocument();
  });

  it("renders missing values as placeholders without setpoint chips", () => {
    render(<AhuSingleFluxSynoptic values={{}} />);

    // 2 air tags + fan chip; no coils, no setpoint chips.
    expect(screen.getAllByText(/—/).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("Supply temperature")).not.toBeInTheDocument();
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

  it("edits a writable setpoint through the modal", async () => {
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
