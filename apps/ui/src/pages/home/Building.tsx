import { Floor } from "./Floor";
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
  onRoomHover: (room: RoomGeometry | null) => void;
  onRoomClick: (room: RoomGeometry, floor: FloorGeometry) => void;
  onDeviceHover: (
    info: { device: MockDevice; room: RoomGeometry } | null,
  ) => void;
};

/**
 * Renders only the floor slabs and the rooms — no exterior shell, facade,
 * walls or roof. The 'doll house' view: the rooms ARE the building.
 */
export function Building({
  building,
  values,
  statuses,
  alertingRooms,
  selectedRoomId,
  onRoomHover,
  onRoomClick,
  onDeviceHover,
}: Props) {
  return (
    <group>
      {/* Subtle ground grid for spatial reference */}
      <gridHelper
        args={[80, 40, "#1d2540", "#0b1322"]}
        position={[0, -0.02, building.depth / 2]}
      />
      {building.floors.map((floor) => (
        <Floor
          key={floor.assetId}
          floor={floor}
          building={building}
          values={values}
          statuses={statuses}
          alertingRooms={alertingRooms}
          selectedRoomId={selectedRoomId}
          onRoomHover={onRoomHover}
          onRoomClick={onRoomClick}
          onDeviceHover={onDeviceHover}
        />
      ))}
    </group>
  );
}
