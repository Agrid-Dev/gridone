import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AttributeValue } from "./AttributeValue";
import {
  DeviceType,
  type DeviceAttribute,
  type FaultAttribute,
} from "@/api/devices";

const base = (
  over: Partial<DeviceAttribute> & { name: string },
): DeviceAttribute => ({
  kind: "standard",
  dataType: "float",
  readWriteModes: ["read"],
  currentValue: null,
  lastUpdated: null,
  lastChanged: null,
  ...over,
});

const faultOf = (
  isFaulty: boolean,
  severity: FaultAttribute["severity"],
): FaultAttribute => ({
  kind: "fault",
  name: "alarm",
  dataType: "bool",
  readWriteModes: ["read"],
  currentValue: isFaulty,
  lastUpdated: null,
  lastChanged: null,
  isFaulty,
  severity,
});

afterEach(cleanup);

describe("AttributeValue", () => {
  it("formats floats to two decimals", () => {
    render(
      <AttributeValue
        deviceType={null}
        attribute={base({ name: "temperature", currentValue: 21.5 })}
      />,
    );
    expect(screen.getByText("21.50")).toBeInTheDocument();
  });

  it("renders ints and the null em dash via the central formatter", () => {
    const { rerender } = render(
      <AttributeValue
        deviceType={null}
        attribute={base({ name: "x", dataType: "int", currentValue: 19 })}
      />,
    );
    expect(screen.getByText("19")).toBeInTheDocument();

    rerender(
      <AttributeValue
        deviceType={null}
        attribute={base({ name: "x", currentValue: null })}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders a known standard enum value with its badge label", () => {
    render(
      <AttributeValue
        deviceType={DeviceType.Thermostat}
        attribute={base({
          name: "mode",
          dataType: "str",
          currentValue: "heat",
        })}
      />,
    );
    expect(screen.getByText("heat")).toBeInTheDocument();
  });

  it("colours faulty values by severity and healthy ones green", () => {
    const { rerender } = render(
      <AttributeValue deviceType={null} attribute={faultOf(true, "alert")} />,
    );
    expect(screen.getByText("true")).toHaveClass("text-red-600");

    rerender(
      <AttributeValue deviceType={null} attribute={faultOf(false, "alert")} />,
    );
    expect(screen.getByText("false")).toHaveClass("text-green-600");
  });
});
