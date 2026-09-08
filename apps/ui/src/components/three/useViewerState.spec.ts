import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Group } from "three";
import type { LevelSummary } from "./levelSummaries";
import { useViewerState } from "./useViewerState";

const LEVELS: LevelSummary[] = [
  {
    globalId: "st-1",
    name: "R+1",
    short: "R+1",
    index: 1,
    zoneCount: 1,
    alertCount: 0,
    zones: [],
  },
  {
    globalId: "st-0",
    name: "RDC",
    short: "RDC",
    index: 0,
    zoneCount: 1,
    alertCount: 0,
    zones: [],
  },
];

const SPACE_STOREYS = new Map([
  ["sp-0", "st-0"],
  ["sp-1", "st-1"],
]);

function setup(scene: Group | null = new Group(), levels = LEVELS) {
  return renderHook(
    (props: { levels: LevelSummary[]; scene: Group | null }) =>
      useViewerState({
        levels: props.levels,
        spaceStoreys: SPACE_STOREYS,
        scene: props.scene,
      }),
    { initialProps: { levels, scene } },
  );
}

function pressEscape() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
}

/** Escape typed inside a field: dispatched on the field, bubbling to window. */
function pressEscapeIn(tagName: "input" | "textarea") {
  const field = document.createElement(tagName);
  document.body.appendChild(field);
  field.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  field.remove();
}

describe("useViewerState", () => {
  it("starts whole, in 3D, with nothing picked", () => {
    const { result } = setup();
    expect(result.current).toMatchObject({
      viewMode: "3d",
      planStoreyId: null,
      exploded: false,
      showFacade: true,
      showMarkers: false,
      colorMode: "temperature",
      selectedId: null,
      focusedLevelId: null,
      viewRequest: null,
    });
  });

  it("selects and flies to a zone, each request a fresh object", () => {
    const { result } = setup();
    act(() => result.current.focusZone("sp-0"));
    const first = result.current.viewRequest;
    expect(result.current.selectedId).toBe("sp-0");
    expect(first).toMatchObject({ kind: "zone", zoneId: "sp-0" });

    // Same room again: the scene must still see a new request.
    act(() => result.current.focusZone("sp-0"));
    expect(result.current.viewRequest).not.toBe(first);
    expect(result.current.viewRequest?.nonce).toBeGreaterThan(first!.nonce);
    // Neither request isolates a level.
    expect(result.current.focusedLevelId).toBeNull();
  });

  it("opens the plan of the isolated level only", () => {
    const { result } = setup();
    act(() => result.current.togglePlan());
    expect(result.current.viewMode).toBe("3d");

    act(() => result.current.focusLevel("st-0"));
    act(() => result.current.togglePlan());
    expect(result.current.viewMode).toBe("plan");
    expect(result.current.planStoreyId).toBe("st-0");

    act(() => result.current.togglePlan());
    expect(result.current.viewMode).toBe("3d");
    // Leaving the plan keeps the level isolated.
    expect(result.current.focusedLevelId).toBe("st-0");
  });

  it("collapses the explode and drops a selection on another floor when the plan opens", () => {
    const { result } = setup();
    act(() => result.current.toggleExploded());
    act(() => result.current.focusZone("sp-1"));
    act(() => result.current.focusLevel("st-0"));
    act(() => result.current.togglePlan());
    expect(result.current.exploded).toBe(false);
    expect(result.current.selectedId).toBeNull();
  });

  it("keeps a selection on the plan's own floor", () => {
    const { result } = setup();
    act(() => result.current.focusZone("sp-0"));
    act(() => result.current.focusLevel("st-0"));
    act(() => result.current.togglePlan());
    expect(result.current.selectedId).toBe("sp-0");
  });

  it("follows a zone to its floor while in plan", () => {
    const { result } = setup();
    act(() => result.current.focusLevel("st-0"));
    act(() => result.current.togglePlan());
    act(() => result.current.focusZone("sp-1"));
    expect(result.current.focusedLevelId).toBe("st-1");
    expect(result.current.planStoreyId).toBe("st-1");
    expect(result.current.selectedId).toBe("sp-1");
  });

  it("closes the plan when the isolation is cleared", () => {
    const { result } = setup();
    act(() => result.current.focusLevel("st-0"));
    act(() => result.current.togglePlan());
    act(() => result.current.focusLevel(null));
    expect(result.current.viewMode).toBe("3d");
    expect(result.current.focusedLevelId).toBeNull();
  });

  it("resets to the whole building in 3D, but only re-frames in plan", () => {
    const { result } = setup();
    act(() => result.current.focusLevel("st-0"));
    act(() => result.current.resetView());
    expect(result.current.focusedLevelId).toBeNull();
    expect(result.current.viewRequest).toMatchObject({ kind: "reset" });

    act(() => result.current.focusLevel("st-0"));
    act(() => result.current.togglePlan());
    act(() => result.current.resetView());
    expect(result.current.viewMode).toBe("plan");
    expect(result.current.focusedLevelId).toBe("st-0");
  });

  it("peels selection, then plan, then isolation with Escape", () => {
    const { result } = setup();
    act(() => result.current.focusLevel("st-0"));
    act(() => result.current.togglePlan());
    act(() => result.current.focusZone("sp-0"));

    act(pressEscape);
    expect(result.current.selectedId).toBeNull();
    expect(result.current.viewMode).toBe("plan");
    act(pressEscape);
    expect(result.current.viewMode).toBe("3d");
    expect(result.current.focusedLevelId).toBe("st-0");
    act(pressEscape);
    expect(result.current.focusedLevelId).toBeNull();
    // Nothing left to peel: the listener is gone, Escape is inert.
    act(pressEscape);
    expect(result.current.viewMode).toBe("3d");
  });

  it("pops back to a breadcrumb depth in one step", () => {
    const { result } = setup();
    const dive = () => {
      act(() => result.current.focusLevel("st-0"));
      act(() => result.current.togglePlan());
      act(() => result.current.focusZone("sp-0"));
    };

    dive();
    act(() => result.current.goToDepth("plan"));
    expect(result.current).toMatchObject({
      selectedId: null,
      viewMode: "plan",
      focusedLevelId: "st-0",
    });

    dive();
    act(() => result.current.goToDepth("level"));
    expect(result.current).toMatchObject({
      selectedId: null,
      viewMode: "3d",
      focusedLevelId: "st-0",
    });

    dive();
    act(() => result.current.goToDepth("building"));
    expect(result.current).toMatchObject({
      selectedId: null,
      viewMode: "3d",
      focusedLevelId: null,
    });
  });

  it("leaves Escape to the field it was typed in", () => {
    const { result } = setup();
    act(() => result.current.focusLevel("st-0"));
    act(() => result.current.togglePlan());
    act(() => result.current.focusZone("sp-0"));

    act(() => pressEscapeIn("input"));
    act(() => pressEscapeIn("textarea"));
    // Clearing the search box must not close the room panel under the operator.
    expect(result.current.selectedId).toBe("sp-0");
    expect(result.current.viewMode).toBe("plan");

    act(pressEscape);
    expect(result.current.selectedId).toBeNull();
  });

  it("leaves the plan when the scene is regenerated", () => {
    const { result, rerender } = setup();
    act(() => result.current.focusLevel("st-0"));
    act(() => result.current.togglePlan());
    rerender({ levels: LEVELS, scene: new Group() });
    expect(result.current.viewMode).toBe("3d");
    expect(result.current.focusedLevelId).toBe("st-0");
  });

  it("drops an isolation the new model no longer contains", () => {
    const { result, rerender } = setup();
    act(() => result.current.focusLevel("st-0"));
    act(() => result.current.togglePlan());
    rerender({ levels: [LEVELS[0]], scene: new Group() });
    expect(result.current.focusedLevelId).toBeNull();
    expect(result.current.viewMode).toBe("3d");
    // An empty level list (model still loading) is not a missing storey.
    act(() => result.current.focusLevel("st-1"));
    rerender({ levels: [], scene: new Group() });
    expect(result.current.focusedLevelId).toBe("st-1");
  });

  it("toggles the layers and the panel", () => {
    const { result } = setup();
    act(() => {
      result.current.toggleExploded();
      result.current.toggleFacade();
      result.current.toggleMarkers();
      result.current.togglePanel();
      result.current.setColorMode("alerts");
    });
    expect(result.current).toMatchObject({
      exploded: true,
      showFacade: false,
      showMarkers: true,
      panelExpanded: true,
      colorMode: "alerts",
    });
  });
});
