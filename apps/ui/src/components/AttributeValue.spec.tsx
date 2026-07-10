import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  it("renders icon + label for a known mode value", () => {
    render(
      <AttributeValue
        value="heat"
        attributeName="mode"
        deviceType={DeviceType.Thermostat}
      />,
    );
    expect(screen.getByText("heat")).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeTruthy();
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

describe("AttributeValue — fault colouring", () => {
  it("colours faulty values by severity and healthy ones green", () => {
    const { rerender } = render(
      <AttributeValue
        value={true}
        attributeName="alarm"
        dataType="bool"
        fault={{ severity: "alert", isFaulty: true }}
      />,
    );
    expect(screen.getByText("true")).toHaveClass("text-status-error");

    rerender(
      <AttributeValue
        value={true}
        attributeName="alarm"
        dataType="bool"
        fault={{ severity: "warning", isFaulty: true }}
      />,
    );
    expect(screen.getByText("true")).toHaveClass("text-status-warning");

    rerender(
      <AttributeValue
        value={false}
        attributeName="alarm"
        dataType="bool"
        fault={{ severity: "alert", isFaulty: false }}
      />,
    );
    expect(screen.getByText("false")).toHaveClass("text-status-ok");
  });
});
