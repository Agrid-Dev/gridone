import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Grid, OrbitControls, OrthographicCamera } from "@react-three/drei";
import { MOUSE, TOUCH, Vector3, type Group, type Mesh } from "three";
import { PlanLabels } from "./PlanLabels";
import { storeyLitShares, type RoomState } from "./roomStates";
import {
  easeDelta,
  easeLayout,
  easeStoreys,
  initialMotion,
  paintSpaces,
} from "./sceneAnimation";
import { pickSpaceId, type ParsedScene } from "./sceneContract";
import { buildSceneLayout } from "./sceneLayout";
import { KeyLight, SceneEnvironment } from "./SceneLighting";
import {
  setSpaceSides,
  spaceStyleTargets,
  type SpaceStyle,
} from "./spaceMaterials";
import { applyStageTheme } from "./stageMaterials";
import type { ColorMode, ViewerTheme } from "./themeColors";
import { useViewerCamera } from "./useViewerCamera";
import type { HoverInfo, ViewRequest } from "./useViewerState";

/** Orbit and plan input maps. The orbit entries restate the three-stdlib
 * defaults: these props must never fall back to `undefined`, which R3F would
 * write into the controls as-is. In plan the left drag pans, like a map. */
const ORBIT_MOUSE_BUTTONS = {
  LEFT: MOUSE.ROTATE,
  MIDDLE: MOUSE.DOLLY,
  RIGHT: MOUSE.PAN,
};
const PLAN_MOUSE_BUTTONS = {
  LEFT: MOUSE.PAN,
  MIDDLE: MOUSE.DOLLY,
  RIGHT: MOUSE.PAN,
};
const ORBIT_TOUCHES = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
const PLAN_TOUCHES = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN };

export type SceneContentProps = {
  scene: Group;
  parsed: ParsedScene;
  roomStates: Map<string, RoomState>;
  theme: ViewerTheme;
  colorMode: ColorMode;
  hoveredId: string | null;
  selectedId: string | null;
  focusedStoreyId: string | null;
  /** Storey shown as a 2D plan, or null while the viewer is in 3D. */
  planStoreyId: string | null;
  exploded: boolean;
  showFacade: boolean;
  showMarkers: boolean;
  viewRequest: ViewRequest | null;
  onHover: (info: HoverInfo | null) => void;
  onSelect: (globalId: string | null) => void;
  onFocusZone: (globalId: string) => void;
};

/**
 * The building inside the canvas: the dressed scene graph, its lights and
 * ground, the frame loop that eases every look toward its goal, picking, and
 * the camera the plan phase machine drives.
 */
export function SceneContent({
  scene,
  parsed,
  roomStates,
  theme,
  colorMode,
  hoveredId,
  selectedId,
  focusedStoreyId,
  planStoreyId,
  exploded,
  showFacade,
  showMarkers,
  viewRequest,
  onHover,
  onSelect,
  onFocusZone,
}: SceneContentProps) {
  const invalidate = useThree((state) => state.invalidate);
  const [motion] = useState(() => initialMotion(exploded, showFacade));
  const styleTargetsRef = useRef(new Map<Mesh, SpaceStyle>());

  const layout = useMemo(
    () => buildSceneLayout(scene, parsed),
    [scene, parsed],
  );
  const litShares = useMemo(
    () => storeyLitShares(parsed.storeys, roomStates),
    [parsed, roomStates],
  );
  const { phase, planish, inFlight, tween } = useViewerCamera({
    scene,
    layout,
    storeyCount: parsed.storeys.length,
    motion,
    planStoreyId,
    viewRequest,
  });

  // The scene graph is shared across mounts through the react-query cache, so
  // each mount re-dresses it with fresh materials — which nothing else frees.
  // The cleanup covers both ends: a layout replaced by a newer one, and the
  // viewer going away.
  useEffect(
    () => () => {
      for (const material of layout.created) {
        material.dispose();
      }
    },
    [layout],
  );

  useEffect(() => {
    for (const materials of layout.materialSets) {
      applyStageTheme(materials, theme.stage);
    }
    invalidate();
  }, [layout, theme, invalidate]);

  useEffect(() => {
    setSpaceSides(layout.spaceMeshes.values(), planish);
    invalidate();
  }, [planish, layout, invalidate]);

  // Rendering is on demand: any input that moves a target the frame loop
  // eases toward has to ask for frames, or the change never paints. Live-data
  // changes are covered by the style-targets effect below.
  useEffect(() => {
    invalidate();
  }, [exploded, showFacade, showMarkers, focusedStoreyId, invalidate]);

  // Recompute the target look of every space whenever live data, hover,
  // selection or theme move. Nothing is written to a material here.
  useEffect(() => {
    styleTargetsRef.current = spaceStyleTargets({
      parsed,
      meshes: layout.spaceMeshes,
      roomStates,
      theme,
      colorMode,
      hoveredId,
      selectedId,
    });
    invalidate();
  }, [
    layout,
    parsed,
    roomStates,
    theme,
    colorMode,
    hoveredId,
    selectedId,
    invalidate,
  ]);

  // The spaces the plan labels — those of the storey it lays flat.
  const planSpaces = useMemo(
    () =>
      parsed.storeys.find((storey) => storey.globalId === planStoreyId)
        ?.spaces ?? [],
    [parsed, planStoreyId],
  );

  useFrame(({ clock }, delta) => {
    const dt = easeDelta(delta);
    let busy = easeLayout(
      motion,
      dt,
      { exploded, showFacade, planish },
      parsed.storeys,
      layout.gap,
    );
    busy =
      easeStoreys(
        motion,
        dt,
        { focusedStoreyId, selectedId, planish },
        parsed.storeys,
        layout,
        litShares,
      ) || busy;
    busy =
      paintSpaces(
        motion,
        dt,
        clock.elapsedTime,
        { selectedId, showMarkers, planish },
        styleTargetsRef.current,
      ) || busy;
    busy = tween(dt) || busy;
    if (busy) {
      invalidate();
    }
  });

  // The space a pointer event lands on, if it may be picked right now.
  const pickedSpaceId = useCallback(
    (event: ThreeEvent<MouseEvent>): string | null => {
      event.stopPropagation();
      return pickSpaceId(event.object, {
        planish,
        planStoreyId,
        spaceStoreys: parsed.spaceStoreys,
      });
    },
    [planish, parsed, planStoreyId],
  );

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const globalId = pickedSpaceId(event);
      onHover(
        globalId
          ? {
              globalId,
              x: event.nativeEvent.clientX,
              y: event.nativeEvent.clientY,
            }
          : null,
      );
    },
    [pickedSpaceId, onHover],
  );

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => onSelect(pickedSpaceId(event)),
    [pickedSpaceId, onSelect],
  );

  // Single click selects; double click also flies in, the way a map behaves.
  const handleDoubleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const globalId = pickedSpaceId(event);
      if (globalId) {
        onFocusZone(globalId);
      }
    },
    [pickedSpaceId, onFocusZone],
  );

  const gridSpan = Math.max(layout.size.x, layout.size.z);
  // The shadow volume covers the exploded stack, not just the built form —
  // isolating or exploding must never push a storey out of the shadow map.
  const explodedRise = layout.gap * Math.max(0, parsed.storeys.length - 1);
  const shadowRadius =
    0.5 *
    Math.hypot(layout.size.x, layout.size.z, layout.size.y + explodedRise) *
    1.15;
  const shadowCenter = useMemo(
    () =>
      new Vector3(
        layout.center.x,
        layout.center.y + explodedRise / 2,
        layout.center.z,
      ),
    [layout, explodedRise],
  );
  const plan = phase === "plan";

  return (
    <>
      <SceneEnvironment />
      {/* A plan wants no atmospheric depth — and a tall building would put
          the overhead camera deep enough into the fog to grey the floor out.
          R3F's attach cleanup restores `scene.fog` when the fog remounts. */}
      {!planish && (
        <fog
          attach="fog"
          args={[theme.stage.fog, gridSpan * 1.8, gridSpan * 7]}
        />
      )}
      <ambientLight intensity={theme.isDark ? 0.3 : 0.45} />
      <KeyLight
        center={shadowCenter}
        radius={shadowRadius}
        intensity={theme.isDark ? 0.9 : 1.05}
      />
      <directionalLight position={[-6, 4, -8]} intensity={0.2} />
      <Grid
        position={[layout.center.x, layout.minY - 0.05, layout.center.z]}
        cellSize={2}
        cellColor={theme.stage.gridCell}
        sectionSize={10}
        sectionColor={theme.stage.gridSection}
        fadeDistance={gridSpan * 6}
        fadeStrength={2}
        infiniteGrid
      />
      {/* Shadow catcher: invisible except where the building shades it, so
          the CSS sky keeps showing through everywhere else. */}
      <mesh
        position={[layout.center.x, layout.minY - 0.045, layout.center.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[gridSpan * 2, 64]} />
        <shadowMaterial
          transparent
          opacity={theme.isDark ? 0.4 : 0.28}
          depthWrite={false}
        />
      </mesh>
      <primitive
        object={scene}
        onPointerMove={handlePointerMove}
        onPointerOut={() => onHover(null)}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      />
      {plan && planSpaces.length > 0 && (
        <PlanLabels
          spaces={planSpaces}
          meshes={layout.spaceMeshes}
          roomStates={roomStates}
          selectedId={selectedId}
        />
      )}
      {/* Mounting swaps the default camera; unmounting restores the same
          perspective camera, still parked at its overhead pose — which is
          exactly where the exit tween starts. Pose, zoom and near are driven
          imperatively by the camera hook, never through props. */}
      {plan && <OrthographicCamera makeDefault up={[0, 0, -1]} />}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        enabled={!inFlight}
        enableRotate={!plan}
        mouseButtons={plan ? PLAN_MOUSE_BUTTONS : ORBIT_MOUSE_BUTTONS}
        touches={plan ? PLAN_TOUCHES : ORBIT_TOUCHES}
      />
    </>
  );
}
