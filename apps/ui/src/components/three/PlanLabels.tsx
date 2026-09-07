import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Vector3, type Mesh, type OrthographicCamera } from "three";
import type { SceneSpace } from "./sceneContract";
import type { RoomState } from "./roomStates";

/** Narrowest on-screen room side, in pixels, that still earns a label. */
export const LABEL_MIN_PX = 56;

/**
 * Whether a room of `sizeX` × `sizeZ` metres deserves a label at the current
 * orthographic `zoom` (pixels per metre): its narrow side must span at least
 * `minPx` on screen. Gating on the room rather than on a global zoom step
 * makes big halls label early while a corridor of closets stays quiet.
 */
export function labelVisibleAtZoom(
  sizeX: number,
  sizeZ: number,
  zoom: number,
): boolean {
  return Math.min(sizeX, sizeZ) * zoom >= LABEL_MIN_PX;
}

type PlanLabel = {
  globalId: string;
  name: string;
  anchor: Vector3;
  sizeX: number;
  sizeZ: number;
};

/**
 * Room-name labels over the 2D floor plan. DOM text via drei's `Html` rather
 * than in-scene glyphs: it inherits the app's font and theme tokens, stays
 * crisp at every zoom, and needs no bundled font file (troika would fetch its
 * default one from a CDN — this product deploys on-prem).
 *
 * Zoom gating writes `display` straight on the divs from the frame loop — no
 * React state, so panning and zooming never re-render the tree. On-demand
 * rendering keeps this honest: the zoom only changes on frames that render.
 */
export function PlanLabels({
  spaces,
  meshes,
  roomStates,
  selectedId,
}: {
  spaces: SceneSpace[];
  meshes: Map<string, Mesh>;
  roomStates: Map<string, RoomState>;
  /** Selected room: its label ignores the zoom gate and reads as a pin. */
  selectedId: string | null;
}) {
  const camera = useThree((state) => state.camera);
  const divsRef = useRef(new Map<string, HTMLDivElement>());
  const shownRef = useRef(new Map<string, boolean>());

  // Geometry is baked in world coordinates and the plan collapses the
  // explode, so a label's anchor is simply the space geometry's centre — the
  // same anchor the device markers use.
  const labels = useMemo(() => {
    const out: PlanLabel[] = [];
    for (const space of spaces) {
      const mesh = meshes.get(space.globalId);
      if (!mesh) {
        continue;
      }
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      if (!box || box.isEmpty()) {
        continue;
      }
      const size = box.getSize(new Vector3());
      out.push({
        globalId: space.globalId,
        name: roomStates.get(space.globalId)?.name ?? space.name,
        anchor: box.getCenter(new Vector3()),
        sizeX: size.x,
        sizeZ: size.z,
      });
    }
    return out;
  }, [spaces, meshes, roomStates]);

  useFrame(() => {
    // Labels only mount in the plan, where the default camera is the
    // orthographic one the plan phase installs.
    const { zoom } = camera as OrthographicCamera;
    for (const label of labels) {
      const visible =
        label.globalId === selectedId ||
        labelVisibleAtZoom(label.sizeX, label.sizeZ, zoom);
      if (shownRef.current.get(label.globalId) !== visible) {
        shownRef.current.set(label.globalId, visible);
        const div = divsRef.current.get(label.globalId);
        if (div) {
          div.style.display = visible ? "" : "none";
        }
      }
    }
  });

  return (
    <>
      {labels.map((label) => (
        <group key={label.globalId} position={label.anchor}>
          {/* zIndexRange caps drei's default (~16M): Html portals into the
              canvas container, where the level/room panels sit at z-10 and
              must stay above the labels. */}
          <Html center zIndexRange={[5, 0]}>
            <div
              ref={(node) => {
                if (node) {
                  divsRef.current.set(label.globalId, node);
                } else {
                  divsRef.current.delete(label.globalId);
                  shownRef.current.delete(label.globalId);
                }
              }}
              style={{ display: "none" }}
              className={
                label.globalId === selectedId
                  ? "pointer-events-none select-none whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-md"
                  : "pointer-events-none select-none whitespace-nowrap rounded bg-card/70 px-1 text-[10px] font-medium text-foreground/90 backdrop-blur-sm"
              }
            >
              {label.name}
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}
