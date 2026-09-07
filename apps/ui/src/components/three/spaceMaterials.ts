/**
 * Materials of the space volumes: a translucent fill and a neon outline per
 * room, plus the device marker. The target look of each room is computed
 * from live data, hover and selection (`spaceStyleTargets`); the frame loop
 * is the single writer of the materials, through `applySpaceStyle` and
 * `applyMarkerStyle`.
 */
import {
  Color,
  DoubleSide,
  EdgesGeometry,
  FrontSide,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import type { RoomState } from "./roomStates";
import type { ParsedScene } from "./sceneContract";
import type { HslTriplet } from "./temperature";
import { zoneTriplet, type ColorMode, type ViewerTheme } from "./themeColors";

/**
 * Target look of one space volume. Computed from live data, hover and
 * selection; applied — with the storey's ghost factor and the alert pulse —
 * by the frame loop.
 */
export type SpaceStyle = {
  color: Color;
  opacity: number;
  emissiveIntensity: number;
  edgeOpacity: number;
  alert: boolean;
  selected: boolean;
  hasDevices: boolean;
  storeyId: string;
};

const SPACE_OPACITY = 0.14;
const SPACE_OPACITY_ACTIVE = 0.34;
/** The picked room reads as solid glass, well past the hover highlight. */
const SPACE_OPACITY_SELECTED = 0.62;
/** Radius of a device marker sphere, in metres. */
const MARKER_RADIUS = 0.35;
/** Under this presence a room's marker is off — its storey is ghosted away. */
const MARKER_PRESENCE_CUTOFF = 0.3;

function toColor(triplet: HslTriplet): Color {
  return new Color().setHSL(
    triplet[0] / 360,
    triplet[1] / 100,
    triplet[2] / 100,
  );
}

/** An alerting room pulses — unless it is the one picked, which glows steady. */
export function isPulsing(style: SpaceStyle): boolean {
  return style.alert && !style.selected;
}

/** Translucent fill of one room; coloured and faded by the frame loop. */
export function makeSpaceMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    metalness: 0,
    roughness: 1,
    transparent: true,
    depthWrite: false,
    envMapIntensity: 0.15,
  });
}

/**
 * Neon-edge outline of a space volume. The LineSegments object is created
 * once per mesh and cached on it — the parsed scene outlives component
 * mounts through the react-query cache, so re-creating it would stack
 * duplicate outlines.
 */
export function edgesOf(mesh: Mesh): LineSegments {
  let edges = mesh.userData.edgesObject as LineSegments | undefined;
  if (!edges) {
    edges = new LineSegments(
      new EdgesGeometry(mesh.geometry, 25),
      new LineBasicMaterial({ transparent: true }),
    );
    // Outlines are decorative: keep the raycaster on the volumes.
    edges.raycast = () => {};
    edges.userData.viewerDecoration = true;
    mesh.userData.edgesObject = edges;
    mesh.add(edges);
  }
  return edges;
}

/**
 * Emissive sphere at a room's centroid, flagging that it has linked devices.
 * Created once per space and cached on it (the parsed scene outlives mounts
 * through the query cache), added as a child of the space mesh so it rides the
 * storey when the building explodes. Left raycastable: a click bubbles up to
 * the space through `findSpaceAncestor`, reusing the existing picking.
 */
export function markerOf(mesh: Mesh): Mesh {
  let marker = mesh.userData.markerObject as Mesh | undefined;
  if (!marker) {
    mesh.geometry.computeBoundingBox();
    const center =
      mesh.geometry.boundingBox?.getCenter(new Vector3()) ?? new Vector3();
    marker = new Mesh(
      new SphereGeometry(MARKER_RADIUS, 16, 12),
      new MeshStandardMaterial({
        transparent: true,
        // Drawn over the massing so the marker reads through slab and facade.
        depthTest: false,
      }),
    );
    marker.position.copy(center);
    marker.renderOrder = 3;
    marker.visible = false;
    marker.userData.viewerDecoration = true;
    mesh.userData.markerObject = marker;
    mesh.add(marker);
  }
  return marker;
}

/**
 * The plan looks into rooms the section cut has opened: with front-side
 * culling their inner walls and floors vanish, so selection, hover, alerts
 * and the colour modes would all be invisible from above. Double-siding the
 * space materials while plan-ish turns every room into a readable coloured
 * cell; the 3D view keeps its calibrated single-sided glass.
 */
export function setSpaceSides(meshes: Iterable<Mesh>, doubleSided: boolean) {
  const side = doubleSided ? DoubleSide : FrontSide;
  for (const mesh of meshes) {
    const material = mesh.material as MeshStandardMaterial;
    if (material.side !== side) {
      material.side = side;
      material.needsUpdate = true;
    }
  }
}

/**
 * Target look of every space from live data, hover, selection and theme.
 * Nothing is written to a material here — the frame loop applies the result.
 */
export function spaceStyleTargets({
  parsed,
  meshes,
  roomStates,
  theme,
  colorMode,
  hoveredId,
  selectedId,
}: {
  parsed: ParsedScene;
  meshes: Map<string, Mesh>;
  roomStates: Map<string, RoomState>;
  theme: ViewerTheme;
  colorMode: ColorMode;
  hoveredId: string | null;
  selectedId: string | null;
}): Map<Mesh, SpaceStyle> {
  const targets = new Map<Mesh, SpaceStyle>();
  for (const storey of parsed.storeys) {
    for (const space of storey.spaces) {
      const mesh = meshes.get(space.globalId);
      if (!mesh) {
        continue;
      }
      const state = roomStates.get(space.globalId);
      const selected = space.globalId === selectedId;
      const hovered = space.globalId === hoveredId;
      const alert = state?.severity === "alert";
      const hasDevices = (state?.devices.length ?? 0) > 0;
      const base = alert ? SPACE_OPACITY_ACTIVE : SPACE_OPACITY;
      // A room only gets a marker once it has a device to mark.
      if (hasDevices) {
        markerOf(mesh);
      }
      targets.set(mesh, {
        color: toColor(zoneTriplet(state, theme, colorMode)),
        opacity: selected
          ? SPACE_OPACITY_SELECTED
          : base + (hovered ? 0.16 : 0),
        // The glow that makes the glass read as lit from within.
        emissiveIntensity: selected ? 1 : hovered ? 0.6 : 0.25,
        edgeOpacity: selected || hovered ? 1 : 0.75,
        alert,
        selected,
        hasDevices,
        storeyId: storey.globalId,
      });
    }
  }
  return targets;
}

/**
 * Writes one space volume's look for this frame: its target style scaled by
 * how present the room should be (`factor`), with the alert pulse on top.
 * `emissiveScale` damps the glow where the calibrated 3D intensities would
 * bleach the colour away, as they do seen from above in plan.
 */
export function applySpaceStyle(
  mesh: Mesh,
  style: SpaceStyle,
  factor: number,
  wave: number,
  emissiveScale = 1,
): void {
  const pulsing = isPulsing(style);
  const material = mesh.material as MeshStandardMaterial;
  material.color = style.color;
  material.emissive = style.color;
  material.emissiveIntensity =
    (pulsing ? 0.55 + 0.35 * wave : style.emissiveIntensity) *
    factor *
    emissiveScale;
  material.opacity =
    (pulsing ? SPACE_OPACITY_ACTIVE + 0.12 * wave : style.opacity) * factor;
  // Drawn over the massing rather than inside it, so the pick reads even when
  // a slab or a facade sits between it and the camera.
  material.depthTest = !style.selected;
  const edges = mesh.userData.edgesObject as LineSegments | undefined;
  if (!edges) {
    return;
  }
  const edgeMaterial = edges.material as LineBasicMaterial;
  edgeMaterial.color = style.color;
  edgeMaterial.opacity = style.edgeOpacity * factor;
  edgeMaterial.depthTest = !style.selected;
}

/**
 * Writes a room's device marker for this frame. Shown when the layer is on,
 * the room has a device, and its storey is not ghosted away; the colour
 * follows the active mode, with the alert pulse on top.
 */
export function applyMarkerStyle(
  mesh: Mesh,
  style: SpaceStyle,
  factor: number,
  wave: number,
  layerOn: boolean,
): void {
  const marker = mesh.userData.markerObject as Mesh | undefined;
  if (!marker) {
    return;
  }
  const shown = layerOn && style.hasDevices && factor > MARKER_PRESENCE_CUTOFF;
  marker.visible = shown;
  if (!shown) {
    return;
  }
  const material = marker.material as MeshStandardMaterial;
  material.color = style.color;
  material.emissive = style.color;
  material.emissiveIntensity = isPulsing(style) ? 0.8 + 0.4 * wave : 0.55;
  material.opacity = 0.6 + 0.4 * factor;
}
