import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { AirExtractorSynoptic } from "./AirExtractorSynoptic";
import type { AirExtractorValues } from "./types";

vi.mock("react-i18next", () =>
  createI18nMock({
    "air_extractor.name": "Air extractor",
    "air_extractor.synoptic.extractAir": "Extract air",
    "air_extractor.synoptic.exhaustAir": "Exhaust air",
    "air_extractor.synoptic.fan": "Extract fan",
    "air_extractor.synoptic.flowSwitch": "Flow switch",
    "air_extractor.synoptic.on": "Running",
    "air_extractor.synoptic.off": "Stopped",
    "air_extractor.synoptic.commandedNoFlow": "Commanded, no flow",
    "air_extractor.synoptic.flowWithoutCommand": "Flow without command",
    "air_extractor.synoptic.flowProven": "Flow proven",
    "air_extractor.synoptic.flowMissing": "No flow",
  }),
);

const RUNNING: AirExtractorValues = {
  onoffState: true,
  fanSpeed: 45,
  flowSwitch: true,
};

afterEach(cleanup);

describe("AirExtractorSynoptic", () => {
  it("renders a single running status, the fan speed and the flow switch", () => {
    render(<AirExtractorSynoptic values={RUNNING} />);

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("45 %")).toBeInTheDocument();
    // The flow switch reads as its own instrument, next to the status.
    expect(screen.getByText("Flow switch")).toBeInTheDocument();
    expect(screen.getByText("Flow proven")).toBeInTheDocument();
    expect(screen.getByText("Extract air")).toBeInTheDocument();
    expect(screen.getByText("Exhaust air")).toBeInTheDocument();
  });

  it("appends the driver's unit to the fan speed when it declares one", () => {
    render(<AirExtractorSynoptic values={RUNNING} fanSpeedUnit="Hz" />);

    expect(screen.getByText("45 Hz")).toBeInTheDocument();
  });

  it("renders a single stopped status (fan proven off)", () => {
    render(
      <AirExtractorSynoptic
        values={{ onoffState: false, fanSpeed: 0, flowSwitch: false }}
      />,
    );

    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText("No flow")).toBeInTheDocument();
    expect(screen.getByText("0 %")).toBeInTheDocument();
  });

  it("labels the reverse discordance and spins the fan from proven flow", () => {
    // Commanded off but flow proven → fan turning, no contradictory "Stopped".
    const { container } = render(
      <AirExtractorSynoptic values={{ onoffState: false, flowSwitch: true }} />,
    );
    expect(screen.getByText("Flow without command")).toBeInTheDocument();
    expect(screen.queryByText("Stopped")).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-spinning='true']"),
    ).toBeInTheDocument();
  });

  it("labels the fan failure and keeps the fan static when commanded on without flow", () => {
    const { container } = render(
      <AirExtractorSynoptic values={{ onoffState: true, flowSwitch: false }} />,
    );
    expect(screen.getByText("Commanded, no flow")).toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-spinning='true']"),
    ).not.toBeInTheDocument();
  });

  it("omits the status badge and the readouts when values are absent", () => {
    render(<AirExtractorSynoptic values={{}} />);

    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(screen.queryByText("Stopped")).not.toBeInTheDocument();
    // Nothing reported: no readout line, just the named streams.
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Extract fan", { selector: "text" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Extract air")).toBeInTheDocument();
  });
});
