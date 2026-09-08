import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "zonesByLevel.viewer.resetView": "Reset view",
    "zonesByLevel.viewer.explode": "Separate floors",
    "zonesByLevel.viewer.collapseFloors": "Stack floors",
    "zonesByLevel.viewer.showFacade": "Show the facade",
    "zonesByLevel.viewer.hideFacade": "Hide the facade",
    "zonesByLevel.viewer.markersShow": "Show device markers",
    "zonesByLevel.viewer.markersHide": "Hide device markers",
    "zonesByLevel.viewer.planShow": "Open the 2D floor plan",
    "zonesByLevel.viewer.planHide": "Back to the 3D view",
    "zonesByLevel.viewer.planNeedsLevel":
      "Select a level to open its floor plan",
  }),
);

import { ViewportControls } from "./ViewportControls";

function renderControls(
  exploded: boolean,
  facade = true,
  markers = false,
  planActive = false,
  planEnabled = true,
) {
  const onToggleExplode = vi.fn();
  const onToggleFacade = vi.fn();
  const onToggleMarkers = vi.fn();
  const onResetView = vi.fn();
  const onTogglePlan = vi.fn();
  render(
    <TooltipProvider>
      <ViewportControls
        exploded={exploded}
        facade={facade}
        markers={markers}
        planActive={planActive}
        planEnabled={planEnabled}
        onToggleExplode={onToggleExplode}
        onToggleFacade={onToggleFacade}
        onToggleMarkers={onToggleMarkers}
        onResetView={onResetView}
        onTogglePlan={onTogglePlan}
      />
    </TooltipProvider>,
  );
  return {
    onToggleExplode,
    onToggleFacade,
    onToggleMarkers,
    onResetView,
    onTogglePlan,
  };
}

afterEach(cleanup);

describe("ViewportControls", () => {
  it("resets the view", async () => {
    const { onResetView, onToggleExplode } = renderControls(true);
    await userEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(onResetView).toHaveBeenCalledTimes(1);
    expect(onToggleExplode).not.toHaveBeenCalled();
  });

  it("offers to stack the floors while they are exploded", async () => {
    const { onToggleExplode } = renderControls(true);
    const toggle = screen.getByRole("button", { name: "Stack floors" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(onToggleExplode).toHaveBeenCalledTimes(1);
  });

  it("shows the facade by default, and offers to hide it", async () => {
    const { onToggleFacade } = renderControls(false);
    const toggle = screen.getByRole("button", { name: "Hide the facade" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(onToggleFacade).toHaveBeenCalledTimes(1);
  });

  it("offers to bring the facade back once it is hidden", () => {
    renderControls(false, false);
    expect(
      screen.getByRole("button", { name: "Show the facade" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("offers to separate the floors while they are stacked", () => {
    renderControls(false);
    const toggle = screen.getByRole("button", { name: "Separate floors" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles the device markers", async () => {
    const { onToggleMarkers } = renderControls(false, true, false);
    const toggle = screen.getByRole("button", { name: "Show device markers" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(onToggleMarkers).toHaveBeenCalledTimes(1);
  });

  it("opens the floor plan of the isolated level", async () => {
    const { onTogglePlan } = renderControls(false);
    const toggle = screen.getByRole("button", {
      name: "Open the 2D floor plan",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(onTogglePlan).toHaveBeenCalledTimes(1);
  });

  it("hints at isolating a level first, without firing", async () => {
    const { onTogglePlan } = renderControls(false, true, false, false, false);
    const hint = screen.getByRole("button", {
      name: "Select a level to open its floor plan",
    });
    // `aria-disabled` rather than `disabled`: the button must keep answering
    // hover so its tooltip can explain what is missing.
    expect(hint).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(hint);
    expect(onTogglePlan).not.toHaveBeenCalled();
  });

  it("offers the way back to 3D while the plan is open", async () => {
    const { onTogglePlan } = renderControls(false, true, false, true);
    const toggle = screen.getByRole("button", { name: "Back to the 3D view" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(onTogglePlan).toHaveBeenCalledTimes(1);
  });

  it("disables explode and facade while the plan is open", () => {
    renderControls(false, true, false, true);
    expect(
      screen.getByRole("button", { name: "Separate floors" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Hide the facade" }),
    ).toBeDisabled();
  });
});
