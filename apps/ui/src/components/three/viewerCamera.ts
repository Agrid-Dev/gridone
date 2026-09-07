/**
 * Camera framing math for the building viewer, kept free of React and of any
 * live three.js object so it can be unit-tested without a WebGL context.
 *
 * Two goals are produced: `fitView` frames the whole (possibly exploded)
 * building the way the first render does, and `focusView` pushes in on a
 * single room while preserving the direction the user is currently looking
 * from — changing distance and pivot only, which reads as a dolly rather than
 * a teleport.
 *
 * Plan mode adds two more: `planApproachView` parks the perspective camera
 * overhead just before the projection swaps to orthographic, and `planView`
 * fits the top-down orthographic plan of one storey (with a section cut).
 */
import { Vector3, type Box3 } from "three";

export type ViewGoal = {
  position: Vector3;
  target: Vector3;
  /** Orthographic zoom carried by plan goals; perspective goals leave it
   * undefined so the tween never touches the camera's zoom. */
  zoom?: number;
};

/** Default three-quarter view used before the user has orbited anywhere. */
const DEFAULT_DIRECTION = new Vector3(1, 0.7, 1).normalize();

/** Breathing room around the whole building / around a single room. */
const FIT_MARGIN = 1.02;
const FOCUS_MARGIN = 1.9;

/** Breathing room around a storey plan, and around a room inside it. */
const PLAN_MARGIN = 1.1;
export const PLAN_FOCUS_MARGIN = 1.9;
/** Metres the plan camera hovers above the storey's highest point. */
const PLAN_CLEARANCE = 2;
/** Slight +Z lean of the overhead approach: it keeps the orbit azimuth
 * defined at the near-vertical pose and settles the screen-up onto -Z — the
 * same up vector the orthographic plan uses, so the projection swap that
 * follows adds no twist. */
const PLAN_TILT = 0.05;
/** Where the plan's section cut sits: `share` of the storey height, capped at
 * `max` metres — eye level on a normal floor, below any in-storey roof. */
const PLAN_CUT = { max: 2.2, share: 0.7 };

/** Guards against a zero-size bounding box collapsing the camera onto its target. */
const MIN_RADIUS = 0.5;

/**
 * Distance at which a sphere of `radius` fills the *narrower* of the two view
 * angles, so a wide-but-short building fills the canvas instead of floating in
 * its center.
 */
export function fitDistance(
  radius: number,
  fovDegrees: number,
  aspect: number,
  margin: number,
): number {
  const fovV = (fovDegrees * Math.PI) / 180;
  const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * safeAspect);
  const angle = Math.min(fovV, fovH);
  return (Math.max(radius, MIN_RADIUS) / Math.sin(angle / 2)) * margin;
}

/** Extra height the exploded stack adds on top of the model's own bounds. */
export function explodedHeight(
  gap: number,
  storeyCount: number,
  spread: number,
): number {
  return gap * Math.max(0, storeyCount - 1) * spread;
}

/** Frames the whole building at the given explode `spread` (0 = collapsed). */
export function fitView({
  size,
  center,
  gap,
  storeyCount,
  spread,
  fov,
  aspect,
}: {
  size: Vector3;
  center: Vector3;
  gap: number;
  storeyCount: number;
  spread: number;
  fov: number;
  aspect: number;
}): ViewGoal {
  const extra = explodedHeight(gap, storeyCount, spread);
  const target = center.clone();
  target.y += extra / 2;
  const radius = new Vector3(size.x, size.y + extra, size.z).length() / 2;
  const distance = fitDistance(radius, fov, aspect, FIT_MARGIN);
  return {
    position: target.clone().addScaledVector(DEFAULT_DIRECTION, distance),
    target,
  };
}

/**
 * Pushes in on `box`, keeping the current view direction (`from` - `pivot`).
 * Falls back to the default three-quarter direction when the camera sits
 * exactly on its pivot.
 */
export function focusView({
  box,
  from,
  pivot,
  fov,
  aspect,
}: {
  box: Box3;
  from: Vector3;
  pivot: Vector3;
  fov: number;
  aspect: number;
}): ViewGoal {
  const target = box.getCenter(new Vector3());
  const radius = box.getSize(new Vector3()).length() / 2;
  const distance = fitDistance(radius, fov, aspect, FOCUS_MARGIN);
  const offset = from.clone().sub(pivot);
  const direction =
    offset.lengthSq() > 1e-6 ? offset.normalize() : DEFAULT_DIRECTION.clone();
  return {
    position: target.clone().addScaledVector(direction, distance),
    target,
  };
}

/**
 * Perspective goal hovering above one storey — the last pose before the
 * projection swaps to orthographic. Framed on the storey's footprint with the
 * same margin as `planView`, so the swap barely re-frames.
 */
export function planApproachView({
  box,
  fov,
  aspect,
}: {
  box: Box3;
  fov: number;
  aspect: number;
}): ViewGoal {
  const target = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const radius = Math.hypot(size.x, size.z) / 2;
  const distance = fitDistance(radius, fov, aspect, PLAN_MARGIN);
  const direction = new Vector3(0, 1, PLAN_TILT).normalize();
  return {
    position: target.clone().addScaledVector(direction, distance),
    target,
  };
}

/**
 * Top-down orthographic goal over `box`, fitted to the viewport. `zoom` is in
 * pixels per world unit — the default R3F/drei orthographic frustum spans the
 * viewport in pixels. `near` puts a section cut through the storey, the way
 * an architectural plan slices a floor: geometry above the cut (in-storey
 * ceilings, roof build-ups) is clipped instead of hiding the rooms, and the
 * raycaster starts at the near plane so picking matches what is visible.
 */
export function planView({
  box,
  width,
  height,
  margin = PLAN_MARGIN,
}: {
  box: Box3;
  width: number;
  height: number;
  margin?: number;
}): ViewGoal & { zoom: number; near: number } {
  const target = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const fit = Math.min(
    width / (Math.max(size.x, MIN_RADIUS) * margin),
    height / (Math.max(size.z, MIN_RADIUS) * margin),
  );
  const zoom = Number.isFinite(fit) && fit > 0 ? fit : 1;
  const position = new Vector3(target.x, box.max.y + PLAN_CLEARANCE, target.z);
  const cutY = box.min.y + Math.min(PLAN_CUT.max, size.y * PLAN_CUT.share);
  const near = Math.max(0.01, position.y - cutY - 0.05);
  return { position, target, zoom, near };
}
