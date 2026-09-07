/**
 * Drives the viewer's camera: the reset and fly-to goals, the 3D ⇄ plan
 * phase machine with its projection swap, and the per-frame tween that
 * carries the camera toward the current goal.
 *
 * The phases:
 * - `3d`: the perspective camera under orbit controls;
 * - `to-plan`: the perspective camera flying overhead, input disabled;
 * - `plan`: an orthographic camera looking straight down, pan and zoom only;
 * - `to-3d`: the perspective camera flying back to the 3D fit, input disabled.
 *
 * The two `to-*` phases bridge a camera tween and the projection swap that
 * follows it; user input is disabled while they run, so the handoff cannot be
 * cancelled halfway.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import {
  Box3,
  Vector3,
  type Camera,
  type Group,
  type PerspectiveCamera,
} from "three";
import { approach, type SceneMotion } from "./sceneAnimation";
import type { SceneLayout } from "./sceneLayout";
import type { ViewRequest } from "./useViewerState";
import {
  fitView,
  focusView,
  PLAN_FOCUS_MARGIN,
  planApproachView,
  planView,
  type ViewGoal,
} from "./viewerCamera";

type PlanPhase = "3d" | "to-plan" | "plan" | "to-3d";

/** The subset of OrbitControls the viewer drives, without importing its type. */
type OrbitLike = {
  target: Vector3;
  /** The camera the controls drive. */
  object?: unknown;
  update?: () => void;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

/** The projection fields shared by the two cameras the viewer swaps between —
 * `zoom`/`near`/`far` live on the subclasses, not on three's `Camera` base. */
type ProjectionCamera = {
  zoom: number;
  near: number;
  far: number;
  updateProjectionMatrix: () => void;
  isOrthographicCamera?: boolean;
};

/** Per-frame easing rate of the camera tween (higher converges faster). */
const CAMERA_EASE = 6;
/** Distance under which a camera tween is considered arrived. */
const TWEEN_EPSILON = 0.05;
/** Wall-clock cap on the to-plan / to-3d camera flight. Under a throttled
 * rAF (background tab, occluded window) the eased tween would take tens of
 * seconds — with the controls disabled the whole time. Past this, the flight
 * snaps to its goal and the projection handoff proceeds. */
const TRANSITION_TIMEOUT_MS = 2500;
/** Far plane of the orthographic plan camera. */
const PLAN_FAR = 500;

const RESET: ViewRequest = { kind: "reset", nonce: 0 };

function orbitOf(controls: unknown): OrbitLike | null {
  return controls as OrbitLike | null;
}

function projectionOf(camera: Camera): ProjectionCamera {
  return camera as unknown as ProjectionCamera;
}

function perspectiveOf(camera: Camera): PerspectiveCamera {
  return camera as PerspectiveCamera;
}

export function useViewerCamera({
  scene,
  layout,
  storeyCount,
  motion,
  planStoreyId,
  viewRequest,
}: {
  scene: Group;
  layout: SceneLayout;
  storeyCount: number;
  /** Live eased quantities — the 3D fit frames the current explode spread. */
  motion: SceneMotion;
  /** Storey shown as a 2D plan, or null while the viewer is in 3D. */
  planStoreyId: string | null;
  viewRequest: ViewRequest | null;
}): {
  phase: PlanPhase;
  /** Heading into, or in, the plan. */
  planish: boolean;
  /** Flying between projections — user input is off. */
  inFlight: boolean;
  /** One frame of the camera tween; true while the camera is still moving. */
  tween: (dt: number) => boolean;
} {
  const { camera, controls, size } = useThree();
  const invalidate = useThree((state) => state.invalidate);
  const [phase, setPhase] = useState<PlanPhase>("3d");
  const fittedRef = useRef<Group | null>(null);
  const tweenRef = useRef<ViewGoal | null>(null);
  /** Last `planStoreyId` the transition driver acted on. */
  const planStoreyRef = useRef<string | null>(null);
  /** Camera + controls couple the swap effect last seeded — a resize must
   * not re-seed, but a rebuilt controls instance must. */
  const swapSeedRef = useRef<{ camera: unknown; controls: unknown } | null>(
    null,
  );
  /** When the current to-* phase began, for the transition timeout guard. */
  const phaseStartRef = useRef(0);
  /** Nonce of the last view request acted on. */
  const handledNonceRef = useRef<number | null>(null);

  const beginFlight = useCallback((next: "to-plan" | "to-3d") => {
    phaseStartRef.current = performance.now();
    setPhase(next);
  }, []);

  // The plan frames one storey; an empty box (a storey with no meshes) falls
  // back to the whole building so the camera never collapses onto a point.
  const planBox = useCallback(
    (storeyId: string | null): Box3 => {
      const box = storeyId ? layout.storeyBoxes.get(storeyId) : undefined;
      return box && !box.isEmpty() ? box : layout.bounds;
    },
    [layout],
  );

  /** Top-down orthographic goal over `box`, fitted to the viewport. */
  const planGoal = useCallback(
    (box: Box3, margin?: number) =>
      planView({ box, width: size.width, height: size.height, margin }),
    [size],
  );

  /** Perspective goal parked overhead of `box`: the last pose before the
   * projection swaps. */
  const approachGoal = useCallback(
    (box: Box3): ViewGoal => {
      const persp = perspectiveOf(camera);
      return planApproachView({ box, fov: persp.fov, aspect: persp.aspect });
    },
    [camera],
  );

  const goalFor = useCallback(
    (request: ViewRequest): ViewGoal | null => {
      const persp = perspectiveOf(camera);
      const plan = phase === "plan";
      if (request.kind === "reset") {
        if (plan) {
          return planGoal(planBox(planStoreyId));
        }
        return fitView({
          size: layout.size,
          center: layout.center,
          gap: layout.gap,
          storeyCount,
          spread: motion.spread,
          fov: persp.fov,
          aspect: persp.aspect,
        });
      }
      const mesh = request.zoneId
        ? layout.spaceMeshes.get(request.zoneId)
        : undefined;
      if (!mesh) {
        return null;
      }
      mesh.updateWorldMatrix(true, false);
      const box = new Box3().setFromObject(mesh);
      if (plan) {
        // Zoom onto the room without leaving the plan — the camera keeps its
        // section cut and only pans and scales.
        return planGoal(box, PLAN_FOCUS_MARGIN);
      }
      return focusView({
        box,
        from: persp.position,
        pivot: orbitOf(controls)?.target ?? new Vector3(),
        fov: persp.fov,
        aspect: persp.aspect,
      });
    },
    [
      camera,
      controls,
      layout,
      storeyCount,
      motion,
      phase,
      planStoreyId,
      planBox,
      planGoal,
    ],
  );

  // Frame the building once per loaded scene, without animating: the first
  // paint should already show the whole model. drei mounts the controls one
  // commit after the canvas, so wait for them before stamping: fitting the
  // camera without a pivot to aim leaves the controls pointing at the world
  // origin, and the stamp would keep the re-run from ever correcting it.
  useEffect(() => {
    const orbit = orbitOf(controls);
    if (!orbit || fittedRef.current === scene) {
      return;
    }
    const goal = goalFor(RESET);
    if (!goal) {
      return;
    }
    fittedRef.current = scene;
    camera.position.copy(goal.position);
    camera.lookAt(goal.target);
    orbit.target.copy(goal.target);
    orbit.update?.();
    invalidate();
  }, [scene, camera, controls, goalFor, invalidate]);

  // Drives the 3D ⇄ plan transitions from the single `planStoreyId` prop.
  // Declared before the view-request effect below, so a zone request landing
  // in the same commit (a cross-storey focus while in plan) wins the tween.
  useEffect(() => {
    const previous = planStoreyRef.current;
    planStoreyRef.current = planStoreyId;
    if (planStoreyId === previous) {
      return;
    }
    if (planStoreyId === null) {
      // Leaving the plan. From "plan" this commit unmounts the orthographic
      // camera; the swap effect then seeds the restored perspective one and
      // starts the return tween. From "to-plan" no swap ever happened — tween
      // straight back from wherever the approach was.
      if (phase === "plan" || phase === "to-plan") {
        beginFlight("to-3d");
        // From "to-plan" no swap ever happened, so tween straight back. From
        // "plan" the swap effect sets the return goal once the perspective
        // camera is restored — until then the orthographic goal must not keep
        // flying, or its settle ends the flight before it starts.
        tweenRef.current = phase === "to-plan" ? goalFor(RESET) : null;
        invalidate();
      }
      return;
    }
    if (previous === null) {
      // Entering: fly the perspective camera overhead; the settle handoff in
      // the tween then swaps the projection.
      beginFlight("to-plan");
      tweenRef.current = approachGoal(planBox(planStoreyId));
      invalidate();
      return;
    }
    // Switching storeys while plan-ish: glide the plan to the other floor.
    if (phase === "plan") {
      const goal = planGoal(planBox(planStoreyId));
      // The section cut is per storey and not worth easing — snap it.
      const projection = projectionOf(camera);
      projection.near = goal.near;
      projection.updateProjectionMatrix();
      tweenRef.current = goal;
      invalidate();
    } else if (phase === "to-plan") {
      tweenRef.current = approachGoal(planBox(planStoreyId));
      invalidate();
    }
  }, [
    planStoreyId,
    phase,
    camera,
    goalFor,
    planBox,
    planGoal,
    approachGoal,
    beginFlight,
    invalidate,
  ]);

  // Runs when the default camera (and with it the controls instance) swaps.
  // drei rebuilds the controls one commit *after* each camera change, and the
  // fresh instance comes up aimed at the world origin — so this waits until
  // the controls in the store actually drive the current camera, then seeds
  // exactly once per (camera, controls) couple: a rebuilt instance re-seeds,
  // a mere resize never does. The orthographic side gets its fitted pose
  // instantly, first-frame style, from the matching overhead approach.
  useEffect(() => {
    const orbit = orbitOf(controls);
    if (orbit && orbit.object !== camera) {
      return;
    }
    const seeded = swapSeedRef.current;
    if (seeded && seeded.camera === camera && seeded.controls === controls) {
      return;
    }
    const projection = projectionOf(camera);
    if (projection.isOrthographicCamera) {
      swapSeedRef.current = { camera, controls };
      const goal = planGoal(planBox(planStoreyRef.current));
      camera.position.copy(goal.position);
      projection.zoom = goal.zoom;
      projection.near = goal.near;
      projection.far = PLAN_FAR;
      projection.updateProjectionMatrix();
      orbit?.target.copy(goal.target);
      orbit?.update?.();
      tweenRef.current = null;
      invalidate();
    } else if (phase === "to-3d") {
      swapSeedRef.current = { camera, controls };
      // The restored perspective camera missed every resize while parked.
      const persp = perspectiveOf(camera);
      persp.aspect = size.width / size.height;
      persp.updateProjectionMatrix();
      orbit?.target.copy(
        planBox(planStoreyRef.current).getCenter(new Vector3()),
      );
      orbit?.update?.();
      tweenRef.current = goalFor(RESET);
      invalidate();
    }
  }, [camera, controls, phase, planBox, planGoal, size, goalFor, invalidate]);

  // Reset / fly-to requests coming from the panel and the viewport controls.
  // `goalFor` changes identity with the phase, the plan storey and the
  // viewport size, so the nonce — which exists to tell one request from the
  // next — is what decides whether this is a new request or the same one
  // arriving with a fresh closure.
  useEffect(() => {
    if (!viewRequest || handledNonceRef.current === viewRequest.nonce) {
      return;
    }
    handledNonceRef.current = viewRequest.nonce;
    tweenRef.current = goalFor(viewRequest);
    invalidate();
  }, [viewRequest, goalFor, invalidate]);

  // A drag, a wheel or a keypress always wins over an in-flight animation.
  useEffect(() => {
    const orbit = orbitOf(controls);
    if (!orbit?.addEventListener) {
      return undefined;
    }
    const cancel = () => {
      tweenRef.current = null;
    };
    orbit.addEventListener("start", cancel);
    return () => orbit.removeEventListener?.("start", cancel);
  }, [controls]);

  const inFlight = phase === "to-plan" || phase === "to-3d";

  // Camera tween toward the last reset / fly-to / plan goal. The settle is
  // the projection handoff: entering plan mounts the orthographic camera only
  // once the overhead approach has landed, and leaving it ends where the 3D
  // fit does.
  const tween = useCallback(
    (dt: number): boolean => {
      const goal = tweenRef.current;
      if (!goal) {
        return false;
      }
      const orbit = orbitOf(controls);
      const projection = projectionOf(camera);
      const step = 1 - Math.exp(-CAMERA_EASE * dt);
      camera.position.lerp(goal.position, step);
      orbit?.target.lerp(goal.target, step);
      if (goal.zoom !== undefined) {
        const zoom = approach(projection.zoom, goal.zoom, step);
        if (zoom !== projection.zoom) {
          projection.zoom = zoom;
          projection.updateProjectionMatrix();
        }
      }
      orbit?.update?.();
      const timedOut =
        inFlight &&
        performance.now() - phaseStartRef.current > TRANSITION_TIMEOUT_MS;
      const arrived =
        camera.position.distanceTo(goal.position) < TWEEN_EPSILON &&
        (orbit?.target.distanceTo(goal.target) ?? 0) < TWEEN_EPSILON &&
        (goal.zoom === undefined || projection.zoom === goal.zoom);
      if (!timedOut && !arrived) {
        return true;
      }
      camera.position.copy(goal.position);
      orbit?.target.copy(goal.target);
      if (goal.zoom !== undefined && projection.zoom !== goal.zoom) {
        projection.zoom = goal.zoom;
        projection.updateProjectionMatrix();
      }
      orbit?.update?.();
      tweenRef.current = null;
      if (phase === "to-plan") {
        setPhase("plan");
      } else if (phase === "to-3d") {
        setPhase("3d");
      }
      return false;
    },
    [camera, controls, phase, inFlight],
  );

  return {
    phase,
    planish: phase === "to-plan" || phase === "plan",
    inFlight,
    tween,
  };
}
