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
    "ahu.synoptic.filter": "Filter",
    "ahu.synoptic.heatingCoil": "Heating coil",
    "ahu.synoptic.coolingCoil": "Cooling coil",
    "ahu.synoptic.supplyFan": "Supply fan",
    "ahu.synoptic.extractFan": "Extract fan",
    "ahu.synoptic.on": "Running",
    "ahu.synoptic.off": "Stopped",
    "ahu.synoptic.setpoints": "Setpoints",
    "ahu.synoptic.supplyAirTemperatureSetpoint": "Supply temperature",
    "ahu.synoptic.supplyAirPressureSetpoint": "Supply pressure",
    "ahu.synoptic.extractAirPressureSetpoint": "Extract pressure",
    "ahu.synoptic.editSetpoint": "Edit setpoint",
    "ahu.synoptic.editSetpointDescription": "Set a new value for {{label}}.",
    "ahu.synoptic.invalidNumber": "Invalid number",
    "common.edit": "Edit",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.readOnly": "Read only",
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
  it("renders air measurements and fan speeds", () => {
    render(<AhuDoubleFluxSynoptic values={VALUES} />);

    expect(screen.getByText("17.8° · 79")).toBeInTheDocument();
    expect(screen.getByText("22.3° · 82")).toBeInTheDocument();
    expect(screen.getByText("15.7°")).toBeInTheDocument();
    expect(screen.getByText("16.4°")).toBeInTheDocument();
    expect(screen.getByText("55 %")).toBeInTheDocument();
    expect(screen.getByText("70 %")).toBeInTheDocument();
  });

  it("renders missing values as placeholders", () => {
    render(<AhuDoubleFluxSynoptic values={{}} />);

    // 4 air tags + 2 fan chips + exchanger chip, no setpoint chips.
    expect(screen.getAllByText(/—/).length).toBeGreaterThanOrEqual(7);
    expect(screen.queryByText("Supply temperature")).not.toBeInTheDocument();
  });

  it("edits a writable setpoint through the modal", async () => {
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

  it("renders non-writable setpoints read-only", () => {
    render(<AhuDoubleFluxSynoptic values={VALUES} />);

    expect(screen.getByText("Extract pressure")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit Extract pressure" }),
    ).not.toBeInTheDocument();
  });
});
