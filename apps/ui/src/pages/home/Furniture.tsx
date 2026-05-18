import { useMemo } from "react";
import type { FurnitureGeometry, MaterialGeometry } from "./data/types";

type Props = {
  furniture: FurnitureGeometry[];
  materials: Record<string, MaterialGeometry>;
};

function FurnitureItem({
  item,
  materials,
}: {
  item: FurnitureGeometry;
  materials: Record<string, MaterialGeometry>;
}) {
  const material = materials[item.material ?? "oakWood"] ?? {
    color: "#888",
  };
  const z = item.z ?? 0;
  const isPlant = item.type === "plant";
  const isLamp = item.type === "lamp";
  const center: [number, number, number] = [
    item.x + item.width / 2,
    z + item.height / 2,
    item.y + item.depth / 2,
  ];

  if (isPlant) {
    return (
      <group position={center} rotation={[0, item.rotation ?? 0, 0]}>
        {/* Pot */}
        <mesh position={[0, -item.height / 2 + 0.18, 0]}>
          <cylinderGeometry
            args={[item.width / 2.6, item.width / 2.2, 0.36, 12]}
          />
          <meshStandardMaterial color="#3a2a1a" roughness={0.85} />
        </mesh>
        {/* Foliage */}
        <mesh position={[0, 0.1, 0]}>
          <coneGeometry args={[item.width / 1.6, item.height - 0.36, 10]} />
          <meshStandardMaterial
            color={material.color}
            roughness={material.roughness ?? 0.95}
          />
        </mesh>
      </group>
    );
  }

  if (isLamp) {
    return (
      <group position={center} rotation={[0, item.rotation ?? 0, 0]}>
        {/* Base */}
        <mesh position={[0, -item.height / 2 + 0.02, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.04, 10]} />
          <meshStandardMaterial color="#1c1815" roughness={0.6} />
        </mesh>
        {/* Stem */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.015, 0.015, item.height - 0.18, 8]} />
          <meshStandardMaterial color="#2b251f" roughness={0.5} />
        </mesh>
        {/* Shade — emissive */}
        <mesh position={[0, item.height / 2 - 0.09, 0]}>
          <coneGeometry args={[item.width / 2, 0.2, 10]} />
          <meshStandardMaterial
            color={material.color}
            emissive={material.emissive ?? "#fff0b0"}
            emissiveIntensity={material.emissiveIntensity ?? 0.9}
            roughness={0.4}
          />
        </mesh>
      </group>
    );
  }

  // Default: box
  return (
    <mesh
      position={center}
      rotation={[0, item.rotation ?? 0, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[item.width, item.height, item.depth]} />
      <meshStandardMaterial
        color={material.color}
        roughness={material.roughness ?? 0.7}
        metalness={material.metalness ?? 0}
      />
    </mesh>
  );
}

export function Furniture({ furniture, materials }: Props) {
  const items = useMemo(() => furniture, [furniture]);
  return (
    <group>
      {items.map((item) => (
        <FurnitureItem key={item.id} item={item} materials={materials} />
      ))}
    </group>
  );
}
