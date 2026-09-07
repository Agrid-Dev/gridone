import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceType } from "@/lib/devices";
import { LiquidDetectorPreview } from "./LiquidDetectorPreview";
import { LiquidDetectorControl } from "./LiquidDetectorControl";

vi.mock("react-i18next", () =>
  createI18nMock({
    "liquid_detector.detected": "Liquide détecté",
    "liquid_detector.dry": "Sec",
  }),
);

/** A detector reporting `value`; pass null to model a probe that has never
 *  reported. Drivers declare the reading as an alert-severity fault, so that
 *  is the shape the components must read. */
function detector(value: boolean | null): Device {
  return {
    id: "d1",
    name: "Colonne 7",
    type: DeviceType.LiquidDetector,
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    is_faulty: value === true,
    attributes:
      value == null
        ? {}
        : {
            liquid_detected: {
              kind: "fault",
              name: "liquid_detected",
              data_type: "bool",
              read_write_modes: ["read"],
              current_value: value,
              severity: "alert",
              healthy_values: [false],
              is_faulty: value,
              last_updated: new Date().toISOString(),
              last_changed: new Date().toISOString(),
            },
          },
  } as unknown as Device;
}

const CONTROL_PROPS = {
  draft: {},
  savingAttr: null,
  feedback: null,
  onDraftChange: () => {},
  onSave: () => {},
};

afterEach(cleanup);

describe("LiquidDetectorPreview", () => {
  it.each([
    [true, "Liquide détecté", "text-water"],
    [false, "Sec", "text-muted-foreground"],
  ])("renders %s as %s in its own tone", (value, label, tone) => {
    render(<LiquidDetectorPreview device={detector(value)} />);

    expect(screen.getByText(label)).toHaveClass(tone);
  });

  it("shows a placeholder when the detector has not reported", () => {
    render(<LiquidDetectorPreview device={detector(null)} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("Sec")).not.toBeInTheDocument();
  });
});

describe("LiquidDetectorControl", () => {
  it("colours a wet probe with the water token, never the alarm red", () => {
    const { container } = render(
      <LiquidDetectorControl device={detector(true)} {...CONTROL_PROPS} />,
    );

    expect(screen.getByText("Liquide détecté")).toHaveClass("text-water");
    // Red belongs to the fault chrome around this panel, not to the reading.
    expect(container.querySelector(".text-status-error")).toBeNull();
  });

  it("leaves the elapsed time to the active-fault row", () => {
    render(
      <LiquidDetectorControl device={detector(true)} {...CONTROL_PROPS} />,
    );

    expect(screen.queryByText(/depuis|since/i)).not.toBeInTheDocument();
  });
});
