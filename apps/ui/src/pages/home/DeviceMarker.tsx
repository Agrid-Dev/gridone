import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MockDevice } from "./data/types";

type Props = {
  device: MockDevice;
  status: "ok" | "alert";
  onHover?: (deviceId: string | null) => void;
};

const OK_COLOR = new THREE.Color("#5eead4");
const ALERT_COLOR = new THREE.Color("#fb7185");

/**
 * Small glowing sphere that hovers near the ceiling of a room. Pulses softly
 * by default; in 'alert' state it blooms red and pulses faster.
 */
export function DeviceMarker({ device, status, onHover }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const pulseSpeed = status === "alert" ? 5.2 : 1.6;
    const pulseDepth = status === "alert" ? 0.45 : 0.18;
    const pulse = 1 + Math.sin(t * pulseSpeed) * pulseDepth;
    if (meshRef.current) {
      meshRef.current.scale.setScalar(pulse);
    }
    if (matRef.current) {
      const target = status === "alert" ? ALERT_COLOR : OK_COLOR;
      matRef.current.color.copy(target);
      matRef.current.emissive.copy(target);
      matRef.current.emissiveIntensity = status === "alert" ? 3.0 : 1.4;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[device.marker.x, device.marker.z, device.marker.y]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover?.(device.id);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHover?.(null);
      }}
    >
      <sphereGeometry args={[0.09, 16, 16]} />
      <meshStandardMaterial
        ref={matRef}
        color={OK_COLOR}
        emissive={OK_COLOR}
        emissiveIntensity={1.4}
        toneMapped={false}
      />
    </mesh>
  );
}
