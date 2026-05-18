import { useCallback, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { BuildingGeometry, RoomGeometry } from "../data/types";

export type CameraGoal = {
  target: THREE.Vector3;
  position: THREE.Vector3;
};

export type HomeCamera = {
  ref: MutableRefObject<OrbitControlsImpl | null>;
  goalRef: MutableRefObject<CameraGoal | null>;
  flyToRoom: (
    room: RoomGeometry,
    floorElevation: number,
    floorHeight: number,
  ) => void;
  flyHome: () => void;
  homeTarget: [number, number, number];
  homePosition: [number, number, number];
};

/**
 * Camera controller for the home page. Exposes:
 *   - `ref`: passed to drei's <OrbitControls> so we can read/write target + position
 *   - `goalRef`: a tween goal; set by flyToRoom / flyHome, consumed by a useFrame
 *     tween inside the Canvas
 *   - imperative `flyToRoom` / `flyHome` actions
 */
export function useHomeCamera(building: BuildingGeometry): HomeCamera {
  const ref = useRef<OrbitControlsImpl | null>(null);
  const goalRef = useRef<CameraGoal | null>(null);

  const homeTarget = useMemo<[number, number, number]>(
    () => [0, 11, building.depth / 2],
    [building.depth],
  );
  const homePosition = useMemo<[number, number, number]>(
    () => [building.frontage * 1.9, 22, building.depth * 1.8],
    [building.frontage, building.depth],
  );

  const flyToRoom = useCallback(
    (room: RoomGeometry, floorElevation: number, floorHeight: number) => {
      const targetX = room.x + room.width / 2;
      const targetY = floorElevation + floorHeight / 2;
      const targetZ = room.y + room.depth / 2;
      // Place camera in front of the room (negative Z is street side),
      // slightly above and offset to the side so the room reads.
      const offsetMag = Math.max(room.width, room.depth, 4) * 1.6;
      const posX = targetX + offsetMag * 0.7;
      const posY = targetY + offsetMag * 0.4;
      const posZ = targetZ - offsetMag * 0.9;
      goalRef.current = {
        target: new THREE.Vector3(targetX, targetY, targetZ),
        position: new THREE.Vector3(posX, posY, posZ),
      };
    },
    [],
  );

  const flyHome = useCallback(() => {
    goalRef.current = {
      target: new THREE.Vector3(homeTarget[0], homeTarget[1], homeTarget[2]),
      position: new THREE.Vector3(
        homePosition[0],
        homePosition[1],
        homePosition[2],
      ),
    };
  }, [homeTarget, homePosition]);

  return { ref, goalRef, flyToRoom, flyHome, homeTarget, homePosition };
}
