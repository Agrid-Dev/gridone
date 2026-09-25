import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceType } from "@/lib/devices";
import type { StandardControlProps } from "../../registry";
import { ElectricityMeterControl } from "../ElectricityMeterControl";

vi.mock("react-i18next", () => createI18nMock({}));

function attr(name: string, current_value: number, unit?: string) {
  return {
    name,
    data_type: "float",
    read_write_modes: ["read"],
    current_value,
    last_updated: null,
    unit,
  };
}

function makeMeter(attributes: ReturnType<typeof attr>[]): Device {
  return {
    id: "dev-1",
    name: "TGBT",
    type: DeviceType.ElectricityMeter,
    tags: {},
    driver_id: "drv-1",
    transport_id: "tr-1",
    config: {},
    attributes: Object.fromEntries(
      attributes.map((a) => [a.name, a]),
    ) as Device["attributes"],
    is_faulty: false,
  };
}

function renderControl(device: Device) {
  const props: StandardControlProps = {
    device,
    draft: {},
    savingAttr: null,
    feedback: null,
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
  };
  return render(<ElectricityMeterControl {...props} />);
}

function reading(label: string): string | null | undefined {
  return screen.getByText(label).nextElementSibling?.textContent;
}

afterEach(cleanup);

describe("ElectricityMeterControl", () => {
  it("shows the units the driver declares", () => {
    renderControl(
      makeMeter([
        attr("active_power", 120, "kW"),
        attr("reactive_power", 30, "kvar"),
        attr("energy", 4500, "MWh"),
        attr("index", 42, "m³"),
      ]),
    );

    expect(reading("Active power")).toBe("120kW");
    expect(reading("Reactive power")).toBe("30kvar");
    expect(reading("Energy")).toBe("4500.0MWh");
    expect(reading("Index")).toBe("42.0m³");
  });

  it("leaves readings bare when the driver declares no unit", () => {
    renderControl(
      makeMeter([
        attr("active_power", 120),
        attr("reactive_power", 30),
        attr("energy", 4500),
        attr("index", 42),
      ]),
    );

    expect(reading("Active power")).toBe("120");
    expect(reading("Reactive power")).toBe("30");
    expect(reading("Energy")).toBe("4500.0");
    expect(reading("Index")).toBe("42.0");
  });
});
