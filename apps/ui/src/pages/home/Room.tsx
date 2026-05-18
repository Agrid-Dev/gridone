import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import { DeviceMarker } from "./DeviceMarker";
import { Furniture } from "./Furniture";
import { temperatureToColor } from "./data/scenario";
import type { MaterialGeometry, MockDevice, RoomGeometry } from "./data/types";

type Props = {
  room: RoomGeometry;
  floorElevation: number;
  floorHeight: number;
  materials: Record<string, MaterialGeometry>;
  /** Current values keyed by device id. */
  values: Map<string, number>;
  statuses: Map<string, "ok" | "alert">;
  isAlerting: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  onHover: (room: RoomGeometry | null) => void;
  onClick: (room: RoomGeometry) => void;
  onDeviceHover: (
    device: { device: MockDevice; room: RoomGeometry } | null,
  ) => void;
};

const TEMP_BASE = 21;

export function Room({
  room,
  floorElevation,
  floorHeight,
  materials,
  values,
  statuses,
  isAlerting,
  isSelected,
  isDimmed,
  onHover,
  onClick,
  onDeviceHover,
}: Props) {
  const tintMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const alertHaloRef = useRef<THREE.Mesh>(null);

  // Find the primary temperature for tint
  const tempDevice = useMemo(
    () => room.devices.find((d) => d.kind === "thermostat"),
    [room.devices],
  );

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const temp = tempDevice
      ? (values.get(tempDevice.id) ?? TEMP_BASE)
      : TEMP_BASE;
    const targetHex = temperatureToColor(temp);
    const target = new THREE.Color(targetHex);
    if (tintMatRef.current) {
      tintMatRef.current.color.lerp(target, 0.12);
      tintMatRef.current.emissive.lerp(target, 0.12);
      const baseIntensity = isAlerting ? 0.85 : isSelected ? 0.55 : 0.32;
      const flicker = isAlerting ? Math.sin(t * 4) * 0.25 : 0;
      tintMatRef.current.emissiveIntensity = Math.max(
        0.05,
        baseIntensity + flicker,
      );
      tintMatRef.current.opacity = isDimmed ? 0.18 : 0.42;
    }
    if (alertHaloRef.current) {
      const pulse = 1 + Math.sin(t * 4) * 0.06;
      alertHaloRef.current.scale.set(pulse, 1, pulse);
      const halo = alertHaloRef.current.material as THREE.MeshStandardMaterial;
      halo.emissiveIntensity = isAlerting ? 2.2 + Math.sin(t * 6) * 0.6 : 0;
      halo.opacity = isAlerting ? 0.45 : 0;
    }
  });

  const centerX = room.x + room.width / 2;
  const centerY = floorElevation + floorHeight / 2;
  const centerZ = room.y + room.depth / 2;

  return (
    <group>
      {/* Heatmap tint box — translucent so we see through to furniture */}
      <mesh
        position={[centerX, centerY, centerZ]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(room);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(room);
        }}
      >
        <boxGeometry args={[room.width, floorHeight * 0.95, room.depth]} />
        <meshStandardMaterial
          ref={tintMatRef}
          color={"#274059"}
          emissive={"#274059"}
          emissiveIntensity={0.32}
          transparent
          opacity={0.42}
          depthWrite={false}
          toneMapped={false}
        />
        <Edges
          threshold={15}
          color={isAlerting ? "#ff6470" : "#67e8f9"}
          linewidth={1.2}
        />
      </mesh>

      {/* Alert halo — flat disc on floor, glows red when alerting */}
      <mesh
        ref={alertHaloRef}
        position={[centerX, floorElevation + 0.03, centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry
          args={[
            Math.min(room.width, room.depth) / 2 - 0.2,
            Math.min(room.width, room.depth) / 2 + 0.4,
            32,
          ]}
        />
        <meshStandardMaterial
          color={"#ff3a3a"}
          emissive={"#ff3a3a"}
          emissiveIntensity={0}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Furniture, positioned relative to the room's SW corner */}
      <group position={[room.x, floorElevation, room.y]}>
        <Furniture furniture={room.furniture} materials={materials} />
        {room.devices.map((device) => (
          <DeviceMarker
            key={device.id}
            device={device}
            status={statuses.get(device.id) ?? "ok"}
            onHover={(id) => {
              if (id) onDeviceHover({ device, room });
              else onDeviceHover(null);
            }}
          />
        ))}
      </group>
    </group>
  );
}
