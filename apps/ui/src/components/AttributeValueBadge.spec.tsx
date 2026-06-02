import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AttributeValueBadge } from "./AttributeValueBadge";

afterEach(() => cleanup());

describe("AttributeValueBadge", () => {
  it("renders plain text for an unknown attribute", () => {
    render(<AttributeValueBadge attributeName="temperature" value="22.5" />);
    expect(screen.getByText("22.5")).toBeTruthy();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("renders plain text for an unknown value of a known attribute", () => {
    render(<AttributeValueBadge attributeName="mode" value="dehumidify" />);
    expect(screen.getByText("dehumidify")).toBeTruthy();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("renders icon + label for a known mode value", () => {
    render(<AttributeValueBadge attributeName="mode" value="heat" />);
    expect(screen.getByText("heat")).toBeTruthy();
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("renders icon + label for a known fan_speed value", () => {
    render(<AttributeValueBadge attributeName="fan_speed" value="low" />);
    expect(screen.getByText("low")).toBeTruthy();
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("renders numeric values as a string label", () => {
    render(<AttributeValueBadge attributeName="setpoint" value={42} />);
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
