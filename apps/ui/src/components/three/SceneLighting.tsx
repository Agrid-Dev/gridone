import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { PMREMGenerator, type DirectionalLight, type Vector3 } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Image-based lighting from three's built-in RoomEnvironment, prefiltered
 * once per renderer. Deliberately not drei's `<Environment preset>`: presets
 * fetch HDRIs from a CDN at runtime, and this product deploys on-prem where
 * the network may not exist. The generated room costs nothing to ship and
 * gives the metallic facade something to reflect.
 */
export function SceneEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    pmrem.dispose();
    room.dispose();
    scene.environment = target.texture;
    scene.environmentIntensity = 0.55;
    invalidate();
    return () => {
      scene.environment = null;
      target.dispose();
    };
  }, [gl, scene, invalidate]);
  return null;
}

/**
 * Shadow-casting key light, its orthographic shadow camera fitted to the
 * building — including the exploded stack's extra height, so pulling the
 * storeys apart never pushes the top ones out of the shadowed volume.
 */
export function KeyLight({
  center,
  radius,
  intensity,
}: {
  center: Vector3;
  radius: number;
  intensity: number;
}) {
  const lightRef = useRef<DirectionalLight>(null);
  useEffect(() => {
    const light = lightRef.current;
    if (!light) {
      return;
    }
    light.target.position.copy(center);
    light.target.updateMatrixWorld();
    const shadowCamera = light.shadow.camera;
    shadowCamera.left = -radius;
    shadowCamera.right = radius;
    shadowCamera.top = radius;
    shadowCamera.bottom = -radius;
    shadowCamera.near = radius * 0.2;
    shadowCamera.far = radius * 4.5;
    shadowCamera.updateProjectionMatrix();
  }, [center, radius]);
  return (
    <directionalLight
      ref={lightRef}
      castShadow
      position={[
        center.x + radius * 1.1,
        center.y + radius * 1.7,
        center.z + radius * 0.8,
      ]}
      intensity={intensity}
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0001}
      shadow-normalBias={0.5}
    />
  );
}
