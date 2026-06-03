import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DeviceType } from "@/api/devices";
import { AttributeValueBadge } from "./AttributeValueBadge";

afterEach(() => cleanup());

describe("AttributeValueBadge", () => {
  it("renders plain text for an unknown attribute", () => {
    render(
      <AttributeValueBadge
        deviceType={DeviceType.Thermostat}
        attributeName="temperature"
        value="22.5"
      />,
    );
    expect(screen.getByText("22.5")).toBeTruthy();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("renders plain text for an unknown value of a known attribute", () => {
    render(
      <AttributeValueBadge
        deviceType={DeviceType.Thermostat}
        attributeName="mode"
        value="dehumidify"
      />,
    );
    expect(screen.getByText("dehumidify")).toBeTruthy();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("renders plain text when deviceType is absent", () => {
    render(<AttributeValueBadge attributeName="mode" value="heat" />);
    expect(screen.getByText("heat")).toBeTruthy();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("renders plain text when the device type has no renderer for the attribute", () => {
    render(
      <AttributeValueBadge
        deviceType={DeviceType.WeatherSensor}
        attributeName="mode"
        value="heat"
      />,
    );
    expect(screen.getByText("heat")).toBeTruthy();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("renders icon + label for a known mode value", () => {
    render(
      <AttributeValueBadge
        deviceType={DeviceType.Thermostat}
        attributeName="mode"
        value="heat"
      />,
    );
    expect(screen.getByText("heat")).toBeTruthy();
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("renders icon + label for a known fan_speed value", () => {
    render(
      <AttributeValueBadge
        deviceType={DeviceType.Thermostat}
        attributeName="fan_speed"
        value="low"
      />,
    );
    expect(screen.getByText("low")).toBeTruthy();
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("renders an icon when all device types share the same renderer", () => {
    render(
      <AttributeValueBadge
        deviceType={[DeviceType.Thermostat, DeviceType.Awhp]}
        attributeName="mode"
        value="heat"
      />,
    );
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("renders plain text when device types disagree on the renderer", () => {
    render(
      <AttributeValueBadge
        deviceType={[DeviceType.Thermostat, DeviceType.WeatherSensor]}
        attributeName="mode"
        value="heat"
      />,
    );
    expect(document.querySelector("svg")).toBeNull();
  });

  it("renders numeric values as a string label", () => {
    render(
      <AttributeValueBadge
        deviceType={DeviceType.Thermostat}
        attributeName="setpoint"
        value={42}
      />,
    );
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("forwards className to the root element", () => {
    const { container } = render(
      <AttributeValueBadge
        attributeName="temperature"
        value="hot"
        className="custom-class"
      />,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
