import { useMemo } from "react";
import { Room } from "./Room";
import type {
  BuildingGeometry,
  FloorGeometry,
  MockDevice,
  RoomGeometry,
} from "./data/types";

type Props = {
  floor: FloorGeometry;
  building: BuildingGeometry;
  values: Map<string, number>;
  statuses: Map<string, "ok" | "alert">;
  alertingRooms: Set<string>;
  selectedRoomId: string | null;
  onRoomHover: (room: RoomGeometry | null) => void;
  onRoomClick: (room: RoomGeometry, floor: FloorGeometry) => void;
  onDeviceHover: (
    info: { device: MockDevice; room: RoomGeometry } | null,
  ) => void;
};

const SLAB_PADDING = 0.1;

export function Floor({
  floor,
  building,
  values,
  statuses,
  alertingRooms,
  selectedRoomId,
  onRoomHover,
  onRoomClick,
  onDeviceHover,
}: Props) {
  const slabThickness = 0.08;
  // Size the slab to the bounding box of this floor's rooms (plus a tiny
  // padding) so it doesn't overhang past the room footprint.
  const slab = useMemo(() => {
    const xs = floor.rooms.flatMap((r) => [r.x, r.x + r.width]);
    const ys = floor.rooms.flatMap((r) => [r.y, r.y + r.depth]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      width: maxX - minX + SLAB_PADDING * 2,
      depth: maxY - minY + SLAB_PADDING * 2,
      cx: (minX + maxX) / 2,
      cz: (minY + maxY) / 2,
    };
  }, [floor.rooms]);
  return (
    <group>
      {/* Floor slab — thin dark plate sized to this floor's room footprint */}
      <mesh
        position={[slab.cx, floor.elevation - slabThickness / 2, slab.cz]}
        receiveShadow
      >
        <boxGeometry args={[slab.width, slabThickness, slab.depth]} />
        <meshStandardMaterial color={"#1a1f2e"} roughness={0.92} />
      </mesh>
      {floor.rooms.map((room) => (
        <Room
          key={room.assetId}
          room={room}
          floorElevation={floor.elevation}
          floorHeight={floor.height}
          materials={building.materials}
          values={values}
          statuses={statuses}
          isAlerting={alertingRooms.has(room.assetId)}
          isSelected={selectedRoomId === room.assetId}
          isDimmed={selectedRoomId !== null && selectedRoomId !== room.assetId}
          onHover={onRoomHover}
          onClick={(r) => onRoomClick(r, floor)}
          onDeviceHover={onDeviceHover}
        />
      ))}
    </group>
  );
}
