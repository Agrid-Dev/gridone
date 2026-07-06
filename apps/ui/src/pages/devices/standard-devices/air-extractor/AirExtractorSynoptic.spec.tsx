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
  it("renders a single running status with fan speed when flow is proven", () => {
    render(<AirExtractorSynoptic values={RUNNING} />);

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByText("Flow proven")).not.toBeInTheDocument();
    expect(screen.getByText("45 %")).toBeInTheDocument();
    expect(screen.getByText("Extract air")).toBeInTheDocument();
    expect(screen.getByText("Exhaust air")).toBeInTheDocument();
  });

  it("renders a single stopped status (fan proven off)", () => {
    render(
      <AirExtractorSynoptic
        values={{ onoffState: false, fanSpeed: 0, flowSwitch: false }}
      />,
    );

    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.queryByText("No flow")).not.toBeInTheDocument();
    expect(screen.getByText("0 %")).toBeInTheDocument();
  });

  it("labels the reverse discordance and spins the fan from proven flow", () => {
    // Commanded off but flow proven → fan turning, no contradictory "Stopped".
    const { container } = render(
      <AirExtractorSynoptic values={{ onoffState: false, flowSwitch: true }} />,
    );
    expect(screen.getByText("Flow without command")).toBeInTheDocument();
    expect(screen.queryByText("Stopped")).not.toBeInTheDocument();
    expect(container.querySelector(".fill-hvac-fan")).toBeInTheDocument();
  });

  it("labels the fan failure and keeps the fan static when commanded on without flow", () => {
    const { container } = render(
      <AirExtractorSynoptic values={{ onoffState: true, flowSwitch: false }} />,
    );
    expect(screen.getByText("Commanded, no flow")).toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(container.querySelector(".fill-hvac-fan")).not.toBeInTheDocument();
  });

  it("omits the status badge and shows a placeholder speed when values are absent", () => {
    render(<AirExtractorSynoptic values={{}} />);

    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(screen.queryByText("Stopped")).not.toBeInTheDocument();
    // The fan-speed chip renders the bare placeholder (no suffix) when absent.
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
