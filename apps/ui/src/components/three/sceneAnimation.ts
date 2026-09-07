/**
 * Per-frame passes of the viewer's frame loop, kept free of React. Every
 * animated quantity eases toward its goal and lands exactly on it; each pass
 * writes the frame's result into the three.js objects and reports whether
 * anything is still moving. Rendering is on demand, so that report is what
 * keeps frames coming — and what lets them stop.
 */
import type { Mesh } from "three";
import { facadeUniforms } from "./facadeMaterial";
import { DEFAULT_LIT_SHARE } from "./roomStates";
import { explodedOffsets, type SceneStorey } from "./sceneContract";
import type { SceneLayout } from "./sceneLayout";
import {
  applyMarkerStyle,
  applySpaceStyle,
  isPulsing,
  type SpaceStyle,
} from "./spaceMaterials";
import { applyGhost } from "./stageMaterials";

/** Per-frame easing rates (higher converges faster). */
const LAYOUT_EASE = 4;
const GHOST_EASE = 5;
const SELECTION_EASE = 8;
/** Under this remaining delta an easing snaps to its goal and stops. */
const SETTLE_EPSILON = 0.002;
/** Largest frame delta fed to the easings — after an idle stretch in
 * on-demand rendering the first delta spans the whole pause, and easing with
 * it would jump every animation straight to its end. */
const MAX_EASE_DELTA = 0.1;
/** Angular rate of the alert pulse, in radians per second. */
const PULSE_RATE = 4;

/** How much of its presence a storey keeps while another one is isolated. */
const GHOST_FACTOR = 0.16;
/** A storey fading below this presence stops casting shadows — a ghosted
 * level throwing a full shadow reads as a glitch, not as depth. */
const SHADOW_GHOST_CUTOFF = 0.5;
/** How much of its presence a room keeps while another one is selected. */
const SELECTION_DIM = 0.3;
/** How much the stage keeps while a room is selected — enough to read the
 * massing around it, little enough to see through. */
const SELECTION_STAGE_DIM = 0.32;
/** Same, in plan mode: the floor plate IS the map, so it stays present —
 * fading it to the 3D level turns the whole plan into a white wash. */
const PLAN_SELECTION_STAGE_DIM = 0.75;
/** Emissive damping while plan-ish. The 3D intensities are calibrated for
 * small volumes seen from the side; from above, a selected room shows its
 * whole floor face and full emissive bleaches its colour away. */
const PLAN_EMISSIVE_SCALE = 0.45;

/**
 * One easing step toward a goal that lands exactly: close enough snaps to the
 * goal itself. Rendering is on demand, so every animated value must reach a
 * state where `value === goal` reads as settled — an asymptote that never
 * arrives would keep requesting frames forever.
 */
export function approach(current: number, goal: number, step: number): number {
  const next = current + (goal - current) * step;
  return Math.abs(goal - next) < SETTLE_EPSILON ? goal : next;
}

/** Frame delta as the easings see it. */
export function easeDelta(delta: number): number {
  return Math.min(delta, MAX_EASE_DELTA);
}

/** Easing step at `rate` for this frame, capped so it can never overshoot. */
function stepAt(rate: number, dt: number): number {
  return Math.min(1, dt * rate);
}

/** The eased quantities of the scene, carried from frame to frame. */
export type SceneMotion = {
  /** Explode spread: 0 stacked, 1 fully apart. */
  spread: number;
  /** Facade presence, 0..1. */
  facade: number;
  /** Selection opening, 0..1 — turns the skin to glass, steps the stage back. */
  open: number;
  /** Ghost presence of each storey, by global id (absent reads as 1). */
  ghost: Map<string, number>;
  /** Selection dim of each space mesh (absent reads as 1). */
  dim: Map<Mesh, number>;
};

/** Motion at rest in the given layout — nothing eases in on first paint. */
export function initialMotion(
  exploded: boolean,
  showFacade: boolean,
): SceneMotion {
  return {
    spread: exploded ? 1 : 0,
    facade: showFacade ? 1 : 0,
    open: 0,
    ghost: new Map(),
    dim: new Map(),
  };
}

export type LayoutGoals = {
  exploded: boolean;
  showFacade: boolean;
  planish: boolean;
};

/** Explode spread, facade presence, and each storey's vertical offset. */
export function easeLayout(
  motion: SceneMotion,
  dt: number,
  goals: LayoutGoals,
  storeys: SceneStorey[],
  gap: number,
): boolean {
  const step = stepAt(LAYOUT_EASE, dt);
  const spreadGoal = goals.exploded ? 1 : 0;
  motion.spread = approach(motion.spread, spreadGoal, step);
  let busy = motion.spread !== spreadGoal;
  // The plan looks straight down: parapets and roof build-ups in the
  // envelope would blank it, so the skin dissolves while plan-ish. The
  // user's facade toggle survives the round trip untouched.
  const facadeGoal = goals.showFacade && !goals.planish ? 1 : 0;
  motion.facade = approach(motion.facade, facadeGoal, step);
  busy ||= motion.facade !== facadeGoal;
  const offsets = explodedOffsets(storeys.length, gap, motion.spread);
  storeys.forEach((storey, index) => {
    storey.object.position.y = approach(
      storey.object.position.y,
      offsets[index],
      step,
    );
    busy ||= storey.object.position.y !== offsets[index];
  });
  return busy;
}

export type StoreyGoals = {
  focusedStoreyId: string | null;
  selectedId: string | null;
  planish: boolean;
};

type StoreyLayout = Pick<
  SceneLayout,
  "storeyMaterials" | "shadowMeshes" | "facade" | "module"
>;

/**
 * Selection opening and per-storey ghosting, written into the stage
 * materials, the shadow casters and the facade grid.
 *
 * Selecting a room opens the building around it: a highlight is useless on a
 * volume buried behind a facade, a slab and twenty other rooms, so the skin
 * turns to glass and the stage steps back, exactly as exploding does.
 * Ghosting keeps the isolated storey present and fades the others — all the
 * way out in plan mode, where a stack of translucent floors overhead would
 * bury the plan. `approach` snaps to exactly 0, so the visibility rule hides
 * settled storeys and restores them on its own.
 */
export function easeStoreys(
  motion: SceneMotion,
  dt: number,
  goals: StoreyGoals,
  storeys: SceneStorey[],
  layout: StoreyLayout,
  litShares: Map<string, number>,
): boolean {
  const ghostStep = stepAt(GHOST_EASE, dt);
  const openGoal = goals.selectedId ? 1 : 0;
  motion.open = approach(motion.open, openGoal, ghostStep);
  let busy = motion.open !== openGoal;
  const openSpread = Math.max(motion.spread, motion.open);
  const stageDim = goals.planish
    ? PLAN_SELECTION_STAGE_DIM
    : SELECTION_STAGE_DIM;
  const stageAmount = 1 - (1 - stageDim) * motion.open;

  for (const storey of storeys) {
    const isolated =
      goals.focusedStoreyId === null ||
      storey.globalId === goals.focusedStoreyId;
    const goal = isolated ? 1 : goals.planish ? 0 : GHOST_FACTOR;
    const presence = approach(
      motion.ghost.get(storey.globalId) ?? 1,
      goal,
      ghostStep,
    );
    busy ||= presence !== goal;
    motion.ghost.set(storey.globalId, presence);
    storey.object.visible = presence > 0;
    const materials = layout.storeyMaterials.get(storey.globalId);
    if (!materials) {
      continue;
    }
    applyGhost(materials, presence, openSpread, motion.facade, stageAmount);
    const casts = presence > SHADOW_GHOST_CUTOFF;
    for (const mesh of layout.shadowMeshes.get(storey.globalId) ?? []) {
      mesh.castShadow = casts;
    }
    const uniforms = facadeUniforms(materials.envelope);
    const params = layout.facade.get(storey.globalId);
    if (uniforms && params) {
      // The grid follows the storey up the exploded stack.
      uniforms.uBaseY.value = params.baseY + storey.object.position.y;
      uniforms.uFloorHeight.value = params.floorHeight;
      uniforms.uModule.value = layout.module;
      uniforms.uSeed.value = storey.index;
      uniforms.uLit.value = litShares.get(storey.globalId) ?? DEFAULT_LIT_SHARE;
    }
  }
  return busy;
}

export type SpaceGoals = {
  selectedId: string | null;
  showMarkers: boolean;
  planish: boolean;
};

/**
 * Single writer of the space materials: target style × ghost × selection
 * dim, plus the alert pulse — and the device markers riding along.
 */
export function paintSpaces(
  motion: SceneMotion,
  dt: number,
  elapsed: number,
  goals: SpaceGoals,
  targets: Map<Mesh, SpaceStyle>,
): boolean {
  const wave = Math.sin(elapsed * PULSE_RATE);
  const dimStep = stepAt(SELECTION_EASE, dt);
  const emissiveScale = goals.planish ? PLAN_EMISSIVE_SCALE : 1;
  let busy = false;
  for (const [mesh, style] of targets) {
    // Picking a room pushes every other one back, so the selection reads at
    // a glance instead of competing with the hover highlight.
    const dimGoal =
      goals.selectedId === null || style.selected ? 1 : SELECTION_DIM;
    const dim = approach(motion.dim.get(mesh) ?? 1, dimGoal, dimStep);
    busy ||= dim !== dimGoal;
    motion.dim.set(mesh, dim);
    const factor = (motion.ghost.get(style.storeyId) ?? 1) * dim;
    // The pulse never settles, so a *visible* alert keeps the loop alive —
    // one on a storey ghosted away would otherwise render forever unseen.
    busy ||= isPulsing(style) && factor > 0;
    applySpaceStyle(mesh, style, factor, wave, emissiveScale);
    applyMarkerStyle(mesh, style, factor, wave, goals.showMarkers);
  }
  return busy;
}
