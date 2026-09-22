import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "common.hvacMode.heat": "Heating",
    "common.hvacMode.cool": "Cooling",
    "common.hvacMode.fan": "Fan",
    "common.hvacMode.auto": "Auto",
    "common.hvacMode.idle": "Idle",
    "common.true": "Vrai",
    "common.false": "Faux",
  }),
);

import { AttributeValue } from "./AttributeValue";
import { DeviceType } from "@/lib/devices";

afterEach(cleanup);

describe("AttributeValue — formatting", () => {
  it("formats floats to two decimals", () => {
    render(
      <AttributeValue
        value={21.5}
        attributeName="temperature"
        dataType="float"
      />,
    );
    expect(screen.getByText("21.50")).toBeInTheDocument();
  });

  it("renders ints verbatim and the null em dash", () => {
    const { rerender } = render(
      <AttributeValue value={19} attributeName="x" dataType="int" />,
    );
    expect(screen.getByText("19")).toBeInTheDocument();

    rerender(
      <AttributeValue value={null} attributeName="x" dataType="float" />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders numeric values as a string label without a data type", () => {
    render(
      <AttributeValue
        value={42}
        attributeName="setpoint"
        deviceType={DeviceType.Thermostat}
      />,
    );
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("forwards className to the root element", () => {
    const { container } = render(
      <AttributeValue
        value="hot"
        attributeName="temperature"
        className="custom-class"
      />,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});

describe("AttributeValue — standard enum badge", () => {
  it("renders icon + translated label for a known mode value", () => {
    render(
      <AttributeValue
        value="heat"
        attributeName="mode"
        deviceType={DeviceType.Thermostat}
      />,
    );
    expect(screen.getByText("Heating")).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("renders the idle mode with an icon and a translated label", () => {
    render(
      <AttributeValue
        value="idle"
        attributeName="mode"
        deviceType={DeviceType.Thermostat}
      />,
    );
    expect(screen.getByText("Idle")).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("renders hvac_mode with the same translated label", () => {
    render(
      <AttributeValue
        value="cool"
        attributeName="hvac_mode"
        deviceType={DeviceType.AhuSingleFlux}
      />,
    );
    expect(screen.getByText("Cooling")).toBeInTheDocument();
  });

  it("keeps non-mode enum values raw (fan_speed)", () => {
    render(
      <AttributeValue
        value="low"
        attributeName="fan_speed"
        deviceType={DeviceType.Thermostat}
      />,
    );
    expect(screen.getByText("low")).toBeInTheDocument();
  });

  it("renders icon + label for a known fan_speed value", () => {
    render(
      <AttributeValue
        value="low"
        attributeName="fan_speed"
        deviceType={DeviceType.Thermostat}
      />,
    );
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("renders plain text for unknown attribute / value / device type", () => {
    const { rerender } = render(
      <AttributeValue
        value="22.5"
        attributeName="temperature"
        deviceType={DeviceType.Thermostat}
      />,
    );
    expect(document.querySelector("svg")).toBeNull();

    rerender(<AttributeValue value="heat" attributeName="mode" />);
    expect(document.querySelector("svg")).toBeNull();

    rerender(
      <AttributeValue
        value="heat"
        attributeName="mode"
        deviceType={DeviceType.WeatherSensor}
      />,
    );
    expect(document.querySelector("svg")).toBeNull();
  });

  it("shows an icon only when all device types share the renderer", () => {
    const { rerender } = render(
      <AttributeValue
        value="heat"
        attributeName="mode"
        deviceType={[DeviceType.Thermostat, DeviceType.Awhp]}
      />,
    );
    expect(document.querySelector("svg")).toBeTruthy();

    rerender(
      <AttributeValue
        value="heat"
        attributeName="mode"
        deviceType={[DeviceType.Thermostat, DeviceType.WeatherSensor]}
      />,
    );
    expect(document.querySelector("svg")).toBeNull();
  });
});

const dot = () => document.querySelector("[data-tone]");

describe("AttributeValue — fault booleans", () => {
  const labels = [
    {
      value: false,
      label: { default: "Fault", translations: { fr: "Défaut" } },
    },
    {
      value: true,
      label: { default: "Healthy", translations: { fr: "Sain" } },
    },
  ];

  it("shows the ok dot and the declared label when healthy", () => {
    // healthy_values: [true] → value true is not faulty; the driver's label
    // wins over the True / False fallback.
    render(
      <AttributeValue
        value={true}
        attributeName="r5_synthese_defaut"
        fault={{ severity: "alert", isFaulty: false }}
        valueLabels={labels}
      />,
    );
    expect(screen.getByText("Sain").parentElement).toHaveClass(
      "text-status-ok",
    );
    expect(dot()).toHaveClass("bg-status-ok");
  });

  it("colours the dot and text by severity when faulty", () => {
    const { rerender } = render(
      <AttributeValue
        value={true}
        attributeName="alarm"
        fault={{ severity: "alert", isFaulty: true }}
      />,
    );
    expect(screen.getByText("Vrai").parentElement).toHaveClass(
      "text-status-error",
    );
    expect(dot()).toHaveClass("bg-status-error");

    rerender(
      <AttributeValue
        value={true}
        attributeName="alarm"
        fault={{ severity: "warning", isFaulty: true }}
      />,
    );
    expect(dot()).toHaveClass("bg-status-warning");
  });

  it("still reads as a fault when the severity is unknown", () => {
    render(
      <AttributeValue
        value={true}
        attributeName="alarm"
        fault={{ severity: "critical" as never, isFaulty: true }}
      />,
    );
    // Mutant: a neutral dot, indistinguishable from a standard boolean.
    expect(dot()).toHaveClass("bg-status-error");
  });

  it("keeps non-boolean faults as coloured text without a dot", () => {
    render(
      <AttributeValue
        value={3}
        attributeName="error_code"
        dataType="int"
        fault={{ severity: "alert", isFaulty: true }}
      />,
    );
    expect(screen.getByText("3")).toHaveClass("text-status-error");
    expect(dot()).toBeNull();
  });
});

describe("AttributeValue — standard booleans", () => {
  it("shows a neutral dot, filled when true, hollow when false", () => {
    const { rerender } = render(
      <AttributeValue value={true} attributeName="presence_tension" />,
    );
    // Standard booleans never use the ok / fault colours.
    expect(screen.getByText("Vrai")).toBeInTheDocument();
    expect(dot()).toHaveClass("bg-muted-foreground");
    expect(dot()?.className).not.toMatch(/bg-status-/);

    rerender(<AttributeValue value={false} attributeName="presence_tension" />);
    expect(screen.getByText("Faux")).toBeInTheDocument();
    expect(dot()).toHaveClass("border-muted-foreground");
    expect(dot()).not.toHaveClass("bg-muted-foreground");
  });

  it("keeps the raw text when a surface opts out of the indicator", () => {
    render(<AttributeValue value={true} attributeName="power" rawBoolean />);
    expect(screen.getByText("true")).toBeInTheDocument();
    expect(dot()).toBeNull();
  });

  it("uses the declared label in the current language", () => {
    render(
      <AttributeValue
        value={true}
        attributeName="onoff_state"
        valueLabels={[
          {
            value: false,
            label: { default: "Off", translations: { fr: "Arrêt" } },
          },
          {
            value: true,
            label: { default: "On", translations: { fr: "Marche" } },
          },
        ]}
      />,
    );
    expect(screen.getByText("Marche")).toBeInTheDocument();
    expect(dot()?.className).not.toMatch(/bg-status-/);
  });
});
