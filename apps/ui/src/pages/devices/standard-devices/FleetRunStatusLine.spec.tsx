import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { FleetRunStatusLine } from "./FleetRunStatusLine";
import type { FleetRunStatus } from "./fleet-status";

vi.mock("react-i18next", () =>
  createI18nMock({
    "devices.card.lead.runState.running": "Running",
    "devices.card.lead.runState.stopped": "Stopped",
    "devices.card.lead.runState.unknown": "Not reported",
    "common.hvacMode.heat": "Heating",
    "common.hvacMode.cool": "Cooling",
  }),
);

afterEach(cleanup);

function renderLine(status: FleetRunStatus) {
  const { container } = render(<FleetRunStatusLine status={status} />);
  return container.querySelector("[aria-hidden]") as HTMLElement;
}

describe("FleetRunStatusLine", () => {
  it.each<[FleetRunStatus, string, string]>([
    [{ run: "running", mode: "heat" }, "Heating", "bg-hvac-heat"],
    [{ run: "running", mode: "cool" }, "Cooling", "bg-hvac-cool"],
    // A mode with no colour keeps the neutral solid marker.
    [{ run: "running", mode: null }, "Running", "bg-foreground/70"],
    // A mode outside the shared vocabulary reads as the driver sends it.
    [{ run: "running", mode: "eco" }, "eco", "bg-foreground/70"],
    // Not running: the run state, whatever mode is configured.
    [{ run: "stopped", mode: "heat" }, "Stopped", "border-muted-foreground/70"],
    [{ run: "unknown", mode: null }, "Not reported", "border-dashed"],
  ])("words %j as %s, marker %s", (status, label, markerClass) => {
    const marker = renderLine(status);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(marker).toHaveClass(markerClass);
  });

  it("never paints a stopped unit's marker in its configured mode's colour", () => {
    const marker = renderLine({ run: "stopped", mode: "heat" });
    expect(marker).not.toHaveClass("bg-hvac-heat");
  });
});
