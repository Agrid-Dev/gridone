export type MaterialGeometry = {
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
};

export type FurnitureType =
  | "bed"
  | "pillow"
  | "duvet"
  | "nightstand"
  | "desk"
  | "chair"
  | "wardrobe"
  | "sofa"
  | "loungeTable"
  | "receptionCounter"
  | "lamp"
  | "plant"
  | "rug"
  | "conferenceTable";

export type FurnitureGeometry = {
  id: string;
  type: FurnitureType;
  x: number;
  y: number;
  z?: number;
  width: number;
  depth: number;
  height: number;
  rotation?: number;
  material?: string;
};

export type DeviceKind =
  | "thermostat"
  | "co2"
  | "occupancy"
  | "ahu"
  | "lighting";

export type MockDevice = {
  id: string;
  name: string;
  kind: DeviceKind;
  unit: string;
  baseline: number;
  /** Marker position inside the room, relative to SW corner. */
  marker: { x: number; y: number; z: number };
};

export type RoomGeometry = {
  assetId: string;
  name: string;
  kind: "guestroom" | "suite" | "conference" | "lobby" | "lounge" | "reception";
  /** SW corner X position in building frame (meters). */
  x: number;
  /** SW corner Y position in building frame (meters). */
  y: number;
  width: number;
  depth: number;
  /** Devices physically located in this room. */
  devices: MockDevice[];
  furniture: FurnitureGeometry[];
};

export type FloorGeometry = {
  assetId: string;
  name: string;
  elevation: number;
  height: number;
  rooms: RoomGeometry[];
};

export type FacadeElement =
  | {
      kind: "window";
      x: number;
      z: number;
      width: number;
      height: number;
      frameMaterial: string;
      glassMaterial: string;
    }
  | {
      kind: "door";
      x: number;
      z: number;
      width: number;
      height: number;
      frameMaterial: string;
      glassMaterial: string;
    }
  | {
      kind: "balcony";
      x: number;
      z: number;
      width: number;
      depth: number;
      height: number;
      material: string;
    }
  | {
      kind: "sign";
      x: number;
      z: number;
      width: number;
      height: number;
      text: string;
      bgMaterial: string;
      textMaterial: string;
    }
  | {
      kind: "ornament";
      x: number;
      z: number;
      width: number;
      height: number;
      material: string;
    }
  | {
      kind: "sconce";
      x: number;
      z: number;
      lightColor: string;
    };

export type BuildingGeometry = {
  buildingAssetId: string;
  name: string;
  referenceUrl: string;
  address: string;
  frontage: number;
  depth: number;
  materials: Record<string, MaterialGeometry>;
  floors: FloorGeometry[];
  facade: FacadeElement[];
};
