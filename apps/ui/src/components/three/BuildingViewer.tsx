import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import {
  Box3,
  Color,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Group,
  type PerspectiveCamera,
} from "three";
import type { Asset, BuildingModel, Device } from "@gridone/sdk";
import { useModelScene } from "./useModelScene";
import {
  explodedOffsets,
  findGeometryCategory,
  findSpaceAncestor,
  parseBuildingScene,
  type ParsedScene,
} from "./sceneContract";
import { buildRoomStates, type RoomState } from "./roomStates";
import { temperatureHsl, type HslTriplet } from "./temperature";
import { useViewerTheme, type ViewerTheme } from "./themeColors";
import { AlertPill } from "./AlertPill";
import { RoomPanel } from "./RoomPanel";

export type BuildingViewerProps = {
  building: Asset;
  model: BuildingModel;
  assets: Asset[];
  devices: Device[];
};

type HoverInfo = { globalId: string; x: number; y: number };

function toColor(triplet: HslTriplet): Color {
  return new Color().setHSL(
    triplet[0] / 360,
    triplet[1] / 100,
    triplet[2] / 100,
  );
}

const FURNITURE_COLOR = "#b7b1a3";
/** Cyan glass of rooms without live data. */
const NEUTRAL_SPACE: HslTriplet = [190, 70, 55];

const SPACE_OPACITY = 0.14;
const SPACE_OPACITY_ACTIVE = 0.34;

function spaceTriplet(
  state: RoomState | undefined,
  theme: ViewerTheme,
): HslTriplet {
  if (state?.severity === "alert") {
    return theme.error;
  }
  if (state?.temperature != null) {
    return temperatureHsl(state.temperature, theme.cool, theme.ok, theme.heat);
  }
  return NEUTRAL_SPACE;
}

/**
 * Neon-edge outline of a space volume. The LineSegments object is created
 * once per mesh and cached on it — the parsed scene outlives component
 * mounts through the react-query cache, so re-creating it would stack
 * duplicate outlines.
 */
function edgesOf(mesh: Mesh): LineSegments {
  let edges = mesh.userData.edgesObject as LineSegments | undefined;
  if (!edges) {
    edges = new LineSegments(
      new EdgesGeometry(mesh.geometry, 25),
      new LineBasicMaterial({ transparent: true }),
    );
    // Outlines are decorative: keep the raycaster on the volumes.
    edges.raycast = () => {};
    mesh.userData.edgesObject = edges;
    mesh.add(edges);
  }
  return edges;
}

function SceneContent({
  scene,
  parsed,
  roomStates,
  theme,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: {
  scene: Group;
  parsed: ParsedScene;
  roomStates: Map<string, RoomState>;
  theme: ViewerTheme;
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (info: HoverInfo | null) => void;
  onSelect: (globalId: string | null) => void;
}) {
  const { camera, controls } = useThree();
  const fittedRef = useRef<Group | null>(null);
  const alertMeshesRef = useRef<Mesh[]>([]);

  // Shared materials per geometry category, unique fill + outline per space
  // so each room can be colored independently.
  const layout = useMemo(() => {
    const spaceMeshes = new Map<string, Mesh>();
    const categoryMaterials = {
      slab: new MeshStandardMaterial({ metalness: 0.1, roughness: 0.85 }),
      structure: new MeshStandardMaterial({
        metalness: 0,
        roughness: 0.4,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      }),
      furniture: new MeshStandardMaterial({
        color: new Color(FURNITURE_COLOR),
        metalness: 0,
        roughness: 0.8,
      }),
    };
    const meshes: Mesh[] = [];
    scene.traverse((child) => {
      if (child instanceof Mesh) {
        meshes.push(child);
      }
    });
    for (const mesh of meshes) {
      const spaceNode = findSpaceAncestor(mesh);
      if (spaceNode) {
        mesh.material = new MeshStandardMaterial({
          metalness: 0,
          roughness: 1,
          transparent: true,
          depthWrite: false,
        });
        edgesOf(mesh);
        spaceMeshes.set(String(spaceNode.userData.global_id), mesh);
      } else {
        mesh.material =
          categoryMaterials[findGeometryCategory(mesh) ?? "structure"];
        // Walls and slabs are now mostly transparent: they must not swallow
        // the raycast, or rooms behind them never receive hover/click.
        mesh.raycast = () => {};
      }
    }
    const bounds = new Box3().setFromObject(scene);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const storeyCount = Math.max(1, parsed.storeys.length);
    const gap = Math.max(1.2, (size.y / storeyCount) * 0.55);
    return {
      spaceMeshes,
      categoryMaterials,
      size,
      center,
      minY: bounds.min.y,
      gap,
    };
  }, [scene, parsed]);

  // Stage colors follow the app theme (light scene in light mode).
  useEffect(() => {
    layout.categoryMaterials.slab.color = new Color(theme.stage.slab);
    layout.categoryMaterials.structure.color = new Color(theme.stage.structure);
  }, [layout, theme]);

  // Restyle space volumes whenever live data, hover, selection or theme move.
  useEffect(() => {
    const alertMeshes: Mesh[] = [];
    for (const storey of parsed.storeys) {
      for (const space of storey.spaces) {
        const mesh = layout.spaceMeshes.get(space.globalId);
        if (!mesh) {
          continue;
        }
        const state = roomStates.get(space.globalId);
        const color = toColor(spaceTriplet(state, theme));
        const active =
          space.globalId === hoveredId || space.globalId === selectedId;
        const material = mesh.material as MeshStandardMaterial;
        material.color = color;
        material.opacity =
          (state?.severity === "alert" ? SPACE_OPACITY_ACTIVE : SPACE_OPACITY) +
          (active ? 0.16 : 0);
        // The glow that makes the glass read as lit from within.
        material.emissive = color;
        material.emissiveIntensity = active ? 0.6 : 0.25;
        const edgeMaterial = edgesOf(mesh).material as LineBasicMaterial;
        edgeMaterial.color = color;
        edgeMaterial.opacity = active ? 1 : 0.75;
        if (state?.severity === "alert") {
          alertMeshes.push(mesh);
        }
      }
    }
    alertMeshesRef.current = alertMeshes;
  }, [layout, parsed, roomStates, theme, hoveredId, selectedId]);

  // Frame the building once per loaded scene: fit the bounding sphere of the
  // *exploded* stack against the narrower of the two view angles so the model
  // fills the canvas instead of floating in its center.
  useEffect(() => {
    if (fittedRef.current === scene) {
      return;
    }
    fittedRef.current = scene;
    const { center, size, gap } = layout;
    const explodedExtra = gap * Math.max(0, parsed.storeys.length - 1);
    const fitCenter = center.clone();
    fitCenter.y += explodedExtra / 2;
    const radius =
      new Vector3(size.x, size.y + explodedExtra, size.z).length() / 2;

    const persp = camera as PerspectiveCamera;
    const fovV = (persp.fov * Math.PI) / 180;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * persp.aspect);
    const distance = (radius / Math.sin(Math.min(fovV, fovH) / 2)) * 1.02;
    persp.position
      .copy(fitCenter)
      .addScaledVector(new Vector3(1, 0.7, 1).normalize(), distance);
    persp.lookAt(fitCenter);

    const orbit = controls as { target?: Vector3; update?: () => void } | null;
    if (orbit?.target) {
      orbit.target.copy(fitCenter);
      orbit.update?.();
    }
  }, [scene, layout, parsed, camera, controls]);

  // Exploded layout: ease each storey toward its offset; pulse alert rooms.
  useFrame(({ clock }, delta) => {
    const offsets = explodedOffsets(parsed.storeys.length, layout.gap, 1);
    parsed.storeys.forEach((storey, index) => {
      const target = offsets[index];
      storey.object.position.y +=
        (target - storey.object.position.y) * Math.min(1, delta * 4);
    });
    const pulse = 0.55 + 0.35 * Math.sin(clock.elapsedTime * 4);
    for (const mesh of alertMeshesRef.current) {
      const material = mesh.material as MeshStandardMaterial;
      material.emissiveIntensity = pulse;
      material.opacity =
        SPACE_OPACITY_ACTIVE + 0.12 * Math.sin(clock.elapsedTime * 4);
    }
  });

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const spaceNode = findSpaceAncestor(event.object);
      if (spaceNode) {
        onHover({
          globalId: String(spaceNode.userData.global_id),
          x: event.nativeEvent.clientX,
          y: event.nativeEvent.clientY,
        });
      } else {
        onHover(null);
      }
    },
    [onHover],
  );

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      const spaceNode = findSpaceAncestor(event.object);
      onSelect(spaceNode ? String(spaceNode.userData.global_id) : null);
    },
    [onSelect],
  );

  const gridSpan = Math.max(layout.size.x, layout.size.z);

  return (
    <>
      <ambientLight intensity={theme.isDark ? 0.65 : 0.9} />
      <directionalLight position={[8, 14, 6]} intensity={1.1} />
      <directionalLight position={[-6, 4, -8]} intensity={0.35} />
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
      <primitive
        object={scene}
        onPointerMove={handlePointerMove}
        onPointerOut={() => onHover(null)}
        onClick={handleClick}
      />
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
    </>
  );
}

/**
 * Live 3D digital twin of the building: exploded storeys from the converted
 * IFC scene, spaces colored by room temperature, alert override and an
 * in-scene room panel.
 */
const BuildingViewer: FC<BuildingViewerProps> = ({
  building,
  model,
  assets,
  devices,
}) => {
  const { t } = useTranslation("home");
  const theme = useViewerTheme();
  const { scene, isLoading, error } = useModelScene(
    building.id,
    model.updated_at,
  );
  const parsed = useMemo(
    () => (scene ? parseBuildingScene(scene) : null),
    [scene],
  );
  const roomStates = useMemo(
    () => buildRoomStates(model.spaces ?? [], assets, devices),
    [model.spaces, assets, devices],
  );

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Esc closes the room panel.
  useEffect(() => {
    if (!selectedId) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId]);

  const hoveredState = hover ? roomStates.get(hover.globalId) : undefined;
  const selectedState = selectedId ? roomStates.get(selectedId) : undefined;

  return (
    <div
      className="relative aspect-[16/9] max-h-[70vh] min-h-64 w-full overflow-hidden rounded-xl"
      data-testid="building-viewer"
    >
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: 45, near: 0.1, far: 500 }}
        style={{ cursor: hover ? "pointer" : "grab" }}
      >
        {scene && parsed && (
          <SceneContent
            scene={scene}
            parsed={parsed}
            roomStates={roomStates}
            theme={theme}
            hoveredId={hover?.globalId ?? null}
            selectedId={selectedId}
            onHover={setHover}
            onSelect={setSelectedId}
          />
        )}
      </Canvas>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          …
        </div>
      )}

      {error != null && (
        <div
          className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground"
          data-testid="building-viewer-error"
        >
          {t("zonesByLevel.viewer.loadError")}
        </div>
      )}

      {hover && hoveredState && hover.globalId !== selectedId && (
        <HoverTooltip info={hover} state={hoveredState} />
      )}

      <AlertPill
        devices={devices}
        assets={assets}
        roomStates={roomStates}
        onFocusRoom={setSelectedId}
      />

      {selectedState && (
        <RoomPanel state={selectedState} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
};

const HoverTooltip: FC<{ info: HoverInfo; state: RoomState }> = ({
  info,
  state,
}) => (
  <div
    className="pointer-events-none fixed z-50 -translate-y-full rounded-lg border border-border bg-popover px-3 py-1.5 text-xs shadow-md"
    style={{ left: info.x + 12, top: info.y - 8 }}
  >
    <span className="font-medium text-foreground">{state.name}</span>
    {state.temperature != null && (
      <span className="ml-2 text-muted-foreground">
        {state.temperature.toFixed(1)}°
      </span>
    )}
  </div>
);

export default BuildingViewer;
