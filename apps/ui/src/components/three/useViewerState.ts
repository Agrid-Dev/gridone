/**
 * Overlay state of the building viewer — what is hovered, selected and
 * isolated, and how the building is viewed — with the rules that keep those
 * consistent: the plan is a plan of the isolated storey, a room focused from
 * outside the scene pulls the plan to its floor, and Escape peels one layer
 * at a time. Owns no three.js object; the scene reads it as props.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Group } from "three";
import type { LevelSummary } from "./levelSummaries";
import type { ColorMode } from "./themeColors";

/** "plan" turns the isolated storey into a top-down 2D floor plan. */
type ViewMode = "3d" | "plan";

/** Depths the breadcrumb can pop back to, from the whole building inwards —
 *  the same layers Escape peels. The selected room is not one of them: it is
 *  where the viewer already is. */
export type ViewerDepth = "building" | "level" | "plan";

export type HoverInfo = { globalId: string; x: number; y: number };

/** One-shot camera instruction sent from the DOM overlays into the scene. */
export type ViewRequest = {
  kind: "reset" | "zone";
  zoneId?: string;
  /** Makes every request a new object, so repeat clicks re-trigger the effect. */
  nonce: number;
};

/**
 * Escape inside a text field belongs to that field — clearing the levels
 * panel's search box — not to the viewer's layers. The peel listener below
 * sits on `window`, so without this it would fire first and close the room
 * panel or leave the plan while the operator is still typing.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/** Device the room panel should point at, re-fired by a fresh nonce. */
export type RevealedDevice = { deviceId: string; nonce: number };

/** Panel starts expanded where there is room for it beside the model. */
function prefersExpandedPanel(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(min-width: 1024px)").matches
  );
}

export function useViewerState({
  levels,
  spaceStoreys,
  scene,
}: {
  levels: LevelSummary[];
  /** Storey of every space, by global id. */
  spaceStoreys: ReadonlyMap<string, string>;
  /** The loaded scene graph — a new object means a regenerated model. */
  scene: Group | null;
}) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedLevelId, setFocusedLevelId] = useState<string | null>(null);
  // The building arrives whole — facade up, the way its owner knows it. The
  // explode control is what opens it into an operational view.
  const [exploded, setExploded] = useState(false);
  const [showFacade, setShowFacade] = useState(true);
  const [showMarkers, setShowMarkers] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>("temperature");
  const [panelExpanded, setPanelExpanded] = useState(prefersExpandedPanel);
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [viewRequest, setViewRequest] = useState<ViewRequest | null>(null);
  const [revealedDevice, setRevealedDevice] = useState<RevealedDevice | null>(
    null,
  );
  const nonceRef = useRef(0);
  const planStoreyId = viewMode === "plan" ? focusedLevelId : null;

  const requestView = useCallback(
    (kind: ViewRequest["kind"], zoneId?: string) => {
      nonceRef.current += 1;
      setViewRequest({ kind, zoneId, nonce: nonceRef.current });
    },
    [],
  );

  // Picking a room from outside the scene has to move the camera too — the
  // room is usually not on screen, or is hidden behind another storey. The
  // plan also follows the room's storey: search, the alert pill and the
  // panel can all target a floor the plan currently hides.
  const focusZone = useCallback(
    (globalId: string) => {
      if (viewMode === "plan") {
        const levelId = spaceStoreys.get(globalId);
        if (levelId) {
          setFocusedLevelId(levelId);
        }
      }
      setSelectedId(globalId);
      requestView("zone", globalId);
    },
    [viewMode, spaceStoreys, requestView],
  );

  // Search lands on a device, not just a room: the room panel has to say
  // *which* one it found. A nonce re-fires the reveal when the same device is
  // picked twice in a row.
  const focusDevice = useCallback(
    (globalId: string, deviceId: string) => {
      focusZone(globalId);
      nonceRef.current += 1;
      setRevealedDevice({ deviceId, nonce: nonceRef.current });
    },
    [focusZone],
  );

  const togglePlan = useCallback(() => {
    if (viewMode === "plan") {
      setViewMode("3d");
      return;
    }
    if (!focusedLevelId) {
      return;
    }
    // The plan lays one storey flat: explode makes no sense there, and a
    // selection kept on another floor would dim the whole plan for a room
    // the plan does not show.
    setExploded(false);
    if (selectedId && spaceStoreys.get(selectedId) !== focusedLevelId) {
      setSelectedId(null);
    }
    setViewMode("plan");
  }, [viewMode, focusedLevelId, selectedId, spaceStoreys]);

  // Clearing the focus must close the plan too — a plan of no storey.
  const focusLevel = useCallback((globalId: string | null) => {
    if (globalId === null) {
      setViewMode("3d");
    }
    setFocusedLevelId(globalId);
  }, []);

  // The breadcrumb's way back out: the same peel Escape walks, in one step.
  const goToDepth = useCallback((depth: ViewerDepth) => {
    setSelectedId(null);
    if (depth === "plan") {
      return;
    }
    setViewMode("3d");
    if (depth === "building") {
      setFocusedLevelId(null);
    }
  }, []);

  const resetView = useCallback(() => {
    // In plan, re-frame the plan — like a map. Leaving it has its own
    // affordances (the 3D button, Escape).
    if (viewMode !== "plan") {
      setFocusedLevelId(null);
    }
    requestView("reset");
  }, [viewMode, requestView]);

  // Esc peels one layer at a time: room panel, then plan, then isolation.
  useEffect(() => {
    if (!selectedId && !focusedLevelId && viewMode === "3d") {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isEditableTarget(event.target)) {
        return;
      }
      if (selectedId) {
        setSelectedId(null);
      } else if (viewMode === "plan") {
        setViewMode("3d");
      } else {
        setFocusedLevelId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, focusedLevelId, viewMode]);

  // A regenerated model swaps the scene object: close the plan before the
  // new scene's instant first-frame fit stomps the orthographic pose.
  useEffect(() => {
    setViewMode("3d");
  }, [scene]);

  // The new model may not contain the focused storey at all.
  useEffect(() => {
    if (
      focusedLevelId &&
      levels.length > 0 &&
      !levels.some((level) => level.globalId === focusedLevelId)
    ) {
      setViewMode("3d");
      setFocusedLevelId(null);
    }
  }, [levels, focusedLevelId]);

  const toggleExploded = useCallback(() => setExploded((on) => !on), []);
  const toggleFacade = useCallback(() => setShowFacade((on) => !on), []);
  const toggleMarkers = useCallback(() => setShowMarkers((on) => !on), []);
  const togglePanel = useCallback(() => setPanelExpanded((on) => !on), []);

  return {
    hover,
    setHover,
    selectedId,
    setSelectedId,
    focusedLevelId,
    focusLevel,
    viewMode,
    planStoreyId,
    togglePlan,
    exploded,
    toggleExploded,
    showFacade,
    toggleFacade,
    showMarkers,
    toggleMarkers,
    colorMode,
    setColorMode,
    panelExpanded,
    togglePanel,
    viewRequest,
    revealedDevice,
    focusZone,
    focusDevice,
    goToDepth,
    resetView,
  };
}
