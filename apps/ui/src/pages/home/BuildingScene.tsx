import { Suspense, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { Building } from "./Building";
import { useHomeCamera } from "./hooks/useHomeCamera";
import type {
  BuildingGeometry,
  FloorGeometry,
  MockDevice,
  RoomGeometry,
} from "./data/types";

type Props = {
  building: BuildingGeometry;
  values: Map<string, number>;
  statuses: Map<string, "ok" | "alert">;
  alertingRooms: Set<string>;
  selectedRoomId: string | null;
  orbitEnabled: boolean;
  onRoomClick: (room: RoomGeometry, floor: FloorGeometry) => void;
  onRoomHover: (room: RoomGeometry | null) => void;
  onDeviceHover: (
    info: { device: MockDevice; room: RoomGeometry } | null,
  ) => void;
  cameraApi: ReturnType<typeof useHomeCamera>;
};

/** Aims OrbitControls at the building center on first mount. */
function CameraInit({
  cameraApi,
}: {
  cameraApi: ReturnType<typeof useHomeCamera>;
}) {
  useEffect(() => {
    const controls = cameraApi.ref.current;
    if (!controls) return;
    controls.target.set(
      cameraApi.homeTarget[0],
      cameraApi.homeTarget[1],
      cameraApi.homeTarget[2],
    );
    controls.update();
  }, [cameraApi]);
  return null;
}

/**
 * Smoothly lerps the camera toward the current goal in `cameraApi.goalRef`.
 * Set by flyToRoom / flyHome; cleared automatically when within tolerance.
 */
function CameraTween({
  cameraApi,
}: {
  cameraApi: ReturnType<typeof useHomeCamera>;
}) {
  useFrame(() => {
    const controls = cameraApi.ref.current;
    const goal = cameraApi.goalRef.current;
    if (!controls || !goal) return;
    controls.target.lerp(goal.target, 0.1);
    controls.object.position.lerp(goal.position, 0.1);
    controls.update();
    if (
      controls.target.distanceTo(goal.target) < 0.05 &&
      controls.object.position.distanceTo(goal.position) < 0.05
    ) {
      cameraApi.goalRef.current = null;
    }
  });
  return null;
}

export function BuildingScene({
  building,
  values,
  statuses,
  alertingRooms,
  selectedRoomId,
  orbitEnabled,
  onRoomClick,
  onRoomHover,
  onDeviceHover,
  cameraApi,
}: Props) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{
        position: cameraApi.homePosition,
        fov: 38,
        near: 0.1,
        far: 250,
      }}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Soft slate background that pairs with the app's surfaces — lighter
         than pure dark so the scene reads as a designed UI panel, not a void. */}
      <color attach="background" args={["#222a3e"]} />
      <fog attach="fog" args={["#222a3e", 70, 240]} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[20, 35, 18]}
        intensity={1.1}
        color={"#ffeac9"}
      />
      <directionalLight
        position={[-18, 25, -10]}
        intensity={0.35}
        color={"#7aa8ff"}
      />
      <hemisphereLight
        color={"#79a8ff"}
        groundColor={"#202028"}
        intensity={0.55}
      />

      <Suspense fallback={null}>
        <Environment preset="city" environmentIntensity={0.25} />
      </Suspense>

      <Building
        building={building}
        values={values}
        statuses={statuses}
        alertingRooms={alertingRooms}
        selectedRoomId={selectedRoomId}
        onRoomClick={onRoomClick}
        onRoomHover={onRoomHover}
        onDeviceHover={onDeviceHover}
      />

      <OrbitControls
        ref={cameraApi.ref}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate={orbitEnabled}
        autoRotateSpeed={0.45}
        minDistance={4}
        maxDistance={120}
        enablePan
        target={cameraApi.homeTarget}
      />
      <CameraInit cameraApi={cameraApi} />
      <CameraTween cameraApi={cameraApi} />

      <EffectComposer>
        <Bloom
          intensity={0.7}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.25}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.5} darkness={0.35} />
      </EffectComposer>
    </Canvas>
  );
}
