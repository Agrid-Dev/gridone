import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { AppCapabilities } from "./AppCapabilities";

vi.mock("react-i18next", () =>
  createI18nMock({
    "capabilities.title": "Declared usage",
    "capabilities.produces": "Creates devices",
    "capabilities.reads": "Reads",
    "capabilities.commands": "Commands",
    "capabilities.none": "This app declares no device usage.",
  }),
);

afterEach(cleanup);

describe("AppCapabilities", () => {
  it("lists produced device types, and read and commanded attributes", () => {
    render(
      <AppCapabilities
        capabilities={{
          produces: ["weather_sensor"],
          reads: { hotel_room: ["occupied", "guest_count"] },
          commands: { thermostat: ["temperature_setpoint"] },
        }}
      />,
    );

    expect(screen.getByText("Creates devices")).toBeInTheDocument();
    expect(screen.getByText("Weather Sensor")).toBeInTheDocument();

    expect(screen.getByText("Reads")).toBeInTheDocument();
    expect(screen.getByText("Hotel Room")).toBeInTheDocument();
    expect(screen.getByText("occupied")).toBeInTheDocument();
    expect(screen.getByText("guest_count")).toBeInTheDocument();

    expect(screen.getByText("Commands")).toBeInTheDocument();
    expect(screen.getByText("Thermostat")).toBeInTheDocument();
    expect(screen.getByText("temperature_setpoint")).toBeInTheDocument();
  });

  it("omits the sections an app does not declare", () => {
    render(
      <AppCapabilities
        capabilities={{ produces: [], reads: {}, commands: { hvac: ["mode"] } }}
      />,
    );

    expect(screen.getByText("Commands")).toBeInTheDocument();
    expect(screen.queryByText("Creates devices")).not.toBeInTheDocument();
    expect(screen.queryByText("Reads")).not.toBeInTheDocument();
  });

  it("says so when the manifest declares nothing", () => {
    render(
      <AppCapabilities
        capabilities={{ produces: [], reads: {}, commands: {} }}
      />,
    );

    expect(
      screen.getByText("This app declares no device usage."),
    ).toBeInTheDocument();
  });

  it("treats missing fields as empty", () => {
    render(<AppCapabilities capabilities={{}} />);

    expect(
      screen.getByText("This app declares no device usage."),
    ).toBeInTheDocument();
  });
});
