import type {
  BuildingGeometry,
  FacadeElement,
  FloorGeometry,
  FurnitureGeometry,
  MockDevice,
  RoomGeometry,
} from "./types";

/**
 * Hand-authored 3D geometry adapted from washington_opera_building_structure.json
 * (Golden Tulip Washington Opera, 50 Rue de Richelieu, Paris). All dimensions are
 * approximate and intended for visual demo purposes only.
 *
 * Coordinate system (meters):
 *   x — along the street facade, origin at center of main entrance.
 *   y — depth into the building from the facade (y=0 at the facade plane).
 *   z — elevation above sidewalk (rendered as Y in three.js).
 */

const FRONTAGE = 14.4;
const DEPTH = 18.0;

const materials = {
  limestoneWall: {
    color: "#d8d0bd",
    roughness: 0.82,
  },
  navyPaintedWood: {
    color: "#062558",
    roughness: 0.42,
  },
  whitePaintedWood: {
    color: "#eff1ef",
    roughness: 0.5,
  },
  blackWroughtIron: {
    color: "#101318",
    metalness: 0.75,
    roughness: 0.38,
  },
  clearGlass: {
    color: "#7bb6cc",
    roughness: 0.08,
    opacity: 0.55,
    emissive: "#86c0d4",
    emissiveIntensity: 0.25,
  },
  goldLettering: {
    color: "#d8b24a",
    metalness: 0.55,
    roughness: 0.28,
    emissive: "#d8b24a",
    emissiveIntensity: 0.4,
  },
  darkRoof: {
    color: "#2b2c30",
    roughness: 0.65,
  },
  // interior / furniture
  oakWood: { color: "#a47a4c", roughness: 0.7 },
  darkOakWood: { color: "#5c3d22", roughness: 0.7 },
  linen: { color: "#f1ece1", roughness: 0.9 },
  blueLinen: { color: "#28435d", roughness: 0.9 },
  rugRed: { color: "#7a1c1c", roughness: 0.95 },
  rugBeige: { color: "#bda37a", roughness: 0.95 },
  upholstery: { color: "#465e7a", roughness: 0.85 },
  cream: { color: "#dccaa3", roughness: 0.65 },
  brass: { color: "#c8a35a", metalness: 0.7, roughness: 0.35 },
  greenery: { color: "#1f6b3a", roughness: 0.95 },
  marble: { color: "#e8e2d2", roughness: 0.25 },
  ceilingLamp: {
    color: "#fff3c4",
    emissive: "#fff0b0",
    emissiveIntensity: 0.9,
    roughness: 0.4,
  },
} as const;

let furnitureSeq = 0;
const fid = (prefix: string): string =>
  `${prefix}-${(furnitureSeq++).toString(36)}`;

function guestroomFurniture(
  roomWidth: number,
  roomDepth: number,
): FurnitureGeometry[] {
  const items: FurnitureGeometry[] = [];

  // Bed — centered along far wall (deepest side), king-sized
  const bedWidth = 1.6;
  const bedDepth = 2.0;
  const bedX = roomWidth / 2 - bedWidth / 2;
  const bedY = roomDepth - bedDepth - 0.25;
  items.push({
    id: fid("bed-frame"),
    type: "bed",
    x: bedX,
    y: bedY,
    width: bedWidth,
    depth: bedDepth,
    height: 0.35,
    material: "darkOakWood",
  });
  items.push({
    id: fid("bed-mattress"),
    type: "bed",
    x: bedX + 0.05,
    y: bedY + 0.05,
    z: 0.35,
    width: bedWidth - 0.1,
    depth: bedDepth - 0.1,
    height: 0.2,
    material: "linen",
  });
  // Duvet
  items.push({
    id: fid("duvet"),
    type: "duvet",
    x: bedX + 0.05,
    y: bedY + 0.35,
    z: 0.55,
    width: bedWidth - 0.1,
    depth: bedDepth - 0.5,
    height: 0.08,
    material: "blueLinen",
  });
  // Two pillows
  items.push({
    id: fid("pillow-l"),
    type: "pillow",
    x: bedX + 0.1,
    y: bedY + 0.1,
    z: 0.55,
    width: 0.55,
    depth: 0.32,
    height: 0.12,
    material: "linen",
  });
  items.push({
    id: fid("pillow-r"),
    type: "pillow",
    x: bedX + bedWidth - 0.65,
    y: bedY + 0.1,
    z: 0.55,
    width: 0.55,
    depth: 0.32,
    height: 0.12,
    material: "linen",
  });

  // Nightstands either side of bed
  items.push({
    id: fid("nightstand-l"),
    type: "nightstand",
    x: bedX - 0.55,
    y: bedY + 0.3,
    width: 0.5,
    depth: 0.45,
    height: 0.55,
    material: "darkOakWood",
  });
  items.push({
    id: fid("nightstand-r"),
    type: "nightstand",
    x: bedX + bedWidth + 0.05,
    y: bedY + 0.3,
    width: 0.5,
    depth: 0.45,
    height: 0.55,
    material: "darkOakWood",
  });
  // Lamps on nightstands
  items.push({
    id: fid("lamp-l"),
    type: "lamp",
    x: bedX - 0.4,
    y: bedY + 0.5,
    z: 0.55,
    width: 0.18,
    depth: 0.18,
    height: 0.35,
    material: "ceilingLamp",
  });
  items.push({
    id: fid("lamp-r"),
    type: "lamp",
    x: bedX + bedWidth + 0.18,
    y: bedY + 0.5,
    z: 0.55,
    width: 0.18,
    depth: 0.18,
    height: 0.35,
    material: "ceilingLamp",
  });

  // Rug under bed
  items.push({
    id: fid("rug"),
    type: "rug",
    x: bedX - 0.4,
    y: bedY - 0.6,
    width: bedWidth + 0.8,
    depth: 1.6,
    height: 0.02,
    material: "rugBeige",
  });

  // Desk along side wall
  items.push({
    id: fid("desk"),
    type: "desk",
    x: 0.2,
    y: 0.3,
    width: 1.2,
    depth: 0.55,
    height: 0.74,
    material: "oakWood",
  });
  items.push({
    id: fid("chair"),
    type: "chair",
    x: 0.55,
    y: 0.95,
    width: 0.5,
    depth: 0.5,
    height: 0.45,
    material: "upholstery",
  });

  // Wardrobe along the other side wall
  items.push({
    id: fid("wardrobe"),
    type: "wardrobe",
    x: roomWidth - 0.7,
    y: 0.3,
    width: 0.6,
    depth: 1.0,
    height: 2.0,
    material: "darkOakWood",
  });

  return items;
}

function suiteFurniture(
  roomWidth: number,
  roomDepth: number,
): FurnitureGeometry[] {
  const items = guestroomFurniture(roomWidth, roomDepth);
  // Add a small lounge area near the window (y near 0)
  items.push({
    id: fid("suite-sofa"),
    type: "sofa",
    x: roomWidth - 2.2,
    y: 0.4,
    width: 1.8,
    depth: 0.8,
    height: 0.75,
    material: "upholstery",
  });
  items.push({
    id: fid("suite-table"),
    type: "loungeTable",
    x: roomWidth - 1.6,
    y: 1.3,
    width: 0.7,
    depth: 0.7,
    height: 0.42,
    material: "darkOakWood",
  });
  return items;
}

function conferenceFurniture(
  roomWidth: number,
  roomDepth: number,
): FurnitureGeometry[] {
  const items: FurnitureGeometry[] = [];
  // Large center conference table
  const tw = Math.min(3.4, roomWidth - 1.6);
  const td = Math.min(1.2, roomDepth - 2.0);
  items.push({
    id: fid("conf-table"),
    type: "conferenceTable",
    x: roomWidth / 2 - tw / 2,
    y: roomDepth / 2 - td / 2,
    width: tw,
    depth: td,
    height: 0.74,
    material: "darkOakWood",
  });
  // Chairs around the table — 4 on each long side
  const chairSize = 0.5;
  for (let i = 0; i < 4; i++) {
    const cx = roomWidth / 2 - tw / 2 + (i + 0.5) * (tw / 4) - chairSize / 2;
    items.push({
      id: fid(`conf-chair-front-${i}`),
      type: "chair",
      x: cx,
      y: roomDepth / 2 - td / 2 - 0.6,
      width: chairSize,
      depth: chairSize,
      height: 0.45,
      material: "upholstery",
    });
    items.push({
      id: fid(`conf-chair-back-${i}`),
      type: "chair",
      x: cx,
      y: roomDepth / 2 + td / 2 + 0.1,
      width: chairSize,
      depth: chairSize,
      height: 0.45,
      material: "upholstery",
    });
  }
  // Plants in corners
  items.push({
    id: fid("conf-plant-l"),
    type: "plant",
    x: 0.3,
    y: 0.3,
    width: 0.5,
    depth: 0.5,
    height: 1.4,
    material: "greenery",
  });
  items.push({
    id: fid("conf-plant-r"),
    type: "plant",
    x: roomWidth - 0.8,
    y: 0.3,
    width: 0.5,
    depth: 0.5,
    height: 1.4,
    material: "greenery",
  });
  // Rug
  items.push({
    id: fid("conf-rug"),
    type: "rug",
    x: 0.4,
    y: 0.5,
    width: roomWidth - 0.8,
    depth: roomDepth - 1.0,
    height: 0.02,
    material: "rugRed",
  });
  return items;
}

function lobbyFurniture(
  roomWidth: number,
  roomDepth: number,
): FurnitureGeometry[] {
  return [
    // Reception counter near rear wall
    {
      id: fid("reception"),
      type: "receptionCounter",
      x: roomWidth / 2 - 2.0,
      y: roomDepth - 1.4,
      width: 4.0,
      depth: 0.9,
      height: 1.1,
      material: "marble",
    },
    // Lounge sofas near the front
    {
      id: fid("lobby-sofa-l"),
      type: "sofa",
      x: 0.6,
      y: 0.8,
      width: 2.4,
      depth: 0.85,
      height: 0.75,
      material: "upholstery",
    },
    {
      id: fid("lobby-sofa-r"),
      type: "sofa",
      x: roomWidth - 3.0,
      y: 0.8,
      width: 2.4,
      depth: 0.85,
      height: 0.75,
      material: "upholstery",
    },
    {
      id: fid("lobby-table"),
      type: "loungeTable",
      x: roomWidth / 2 - 0.6,
      y: 1.0,
      width: 1.2,
      depth: 0.7,
      height: 0.42,
      material: "darkOakWood",
    },
    // Plants flanking entrance
    {
      id: fid("plant-l"),
      type: "plant",
      x: 0.4,
      y: 0.2,
      width: 0.45,
      depth: 0.45,
      height: 1.5,
      material: "greenery",
    },
    {
      id: fid("plant-r"),
      type: "plant",
      x: roomWidth - 0.85,
      y: 0.2,
      width: 0.45,
      depth: 0.45,
      height: 1.5,
      material: "greenery",
    },
    // Large rug
    {
      id: fid("lobby-rug"),
      type: "rug",
      x: 0.6,
      y: 1.8,
      width: roomWidth - 1.2,
      depth: 3.0,
      height: 0.02,
      material: "rugBeige",
    },
  ];
}

function loungeFurniture(
  roomWidth: number,
  roomDepth: number,
): FurnitureGeometry[] {
  const items: FurnitureGeometry[] = [];
  // Two breakfast tables with chairs
  for (let i = 0; i < 2; i++) {
    const tx = 0.8 + i * 2.6;
    items.push({
      id: fid(`bk-table-${i}`),
      type: "loungeTable",
      x: tx,
      y: roomDepth / 2 - 0.4,
      width: 1.0,
      depth: 0.8,
      height: 0.74,
      material: "darkOakWood",
    });
    items.push({
      id: fid(`bk-chair-a-${i}`),
      type: "chair",
      x: tx + 0.1,
      y: roomDepth / 2 - 1.1,
      width: 0.45,
      depth: 0.45,
      height: 0.45,
      material: "upholstery",
    });
    items.push({
      id: fid(`bk-chair-b-${i}`),
      type: "chair",
      x: tx + 0.45,
      y: roomDepth / 2 + 0.5,
      width: 0.45,
      depth: 0.45,
      height: 0.45,
      material: "upholstery",
    });
  }
  // Plant
  items.push({
    id: fid("lounge-plant"),
    type: "plant",
    x: roomWidth - 0.8,
    y: 0.3,
    width: 0.45,
    depth: 0.45,
    height: 1.4,
    material: "greenery",
  });
  return items;
}

let deviceSeq = 0;
const did = (): string => `dev-${(deviceSeq++).toString(36).padStart(3, "0")}`;

function guestroomDevices(
  roomWidth: number,
  roomDepth: number,
  roomHeight: number,
  baselineTemp: number,
): MockDevice[] {
  return [
    {
      id: did(),
      name: "Thermostat",
      kind: "thermostat",
      unit: "°C",
      baseline: baselineTemp,
      marker: {
        x: roomWidth / 2,
        y: roomDepth / 2,
        z: roomHeight - 0.2,
      },
    },
    {
      id: did(),
      name: "Occupancy",
      kind: "occupancy",
      unit: "",
      baseline: 0,
      marker: {
        x: roomWidth / 2 - 0.6,
        y: roomDepth / 2,
        z: roomHeight - 0.2,
      },
    },
  ];
}

function publicRoomDevices(
  roomWidth: number,
  roomDepth: number,
  roomHeight: number,
  baselineTemp: number,
  baselineCO2: number,
): MockDevice[] {
  return [
    {
      id: did(),
      name: "Thermostat",
      kind: "thermostat",
      unit: "°C",
      baseline: baselineTemp,
      marker: {
        x: roomWidth / 2 - 0.8,
        y: roomDepth / 2,
        z: roomHeight - 0.2,
      },
    },
    {
      id: did(),
      name: "CO₂",
      kind: "co2",
      unit: "ppm",
      baseline: baselineCO2,
      marker: {
        x: roomWidth / 2 + 0.8,
        y: roomDepth / 2,
        z: roomHeight - 0.2,
      },
    },
  ];
}

// Standard 3-column guestroom layout per floor.
//   Front row (street-facing): y = 0.3, depth = 5.2
//   Corridor:                  y = 5.5 to 7.0
//   Rear row (courtyard):      y = 9.0, depth = 5.5
//   x columns (SW corners):    -6.8, -2.2, 2.4  (width 4.4 each)
const FRONT_Y = 0.3;
const FRONT_DEPTH = 5.2;
const REAR_Y = 9.0;
const REAR_DEPTH = 5.5;
const COLUMNS = [-6.8, -2.2, 2.4];
const COL_WIDTH = 4.4;

function buildGuestFloor(
  floorIndex: number,
  elevation: number,
  height: number,
  startTemp: number,
): FloorGeometry {
  const rooms: RoomGeometry[] = [];
  // Front row: street-facing — orientation 'street' (slightly warmer south sun)
  COLUMNS.forEach((col, i) => {
    const name = `Room ${floorIndex}0${i + 1}`;
    rooms.push({
      assetId: `room-${floorIndex}-0${i + 1}`,
      name,
      kind: "guestroom",
      x: col,
      y: FRONT_Y,
      width: COL_WIDTH,
      depth: FRONT_DEPTH,
      devices: guestroomDevices(
        COL_WIDTH,
        FRONT_DEPTH,
        height,
        startTemp + 0.3 * i,
      ),
      furniture: guestroomFurniture(COL_WIDTH, FRONT_DEPTH),
    });
  });
  // Rear row: courtyard-facing — cooler
  COLUMNS.forEach((col, i) => {
    const name = `Room ${floorIndex}0${i + 4}`;
    rooms.push({
      assetId: `room-${floorIndex}-0${i + 4}`,
      name,
      kind: "guestroom",
      x: col,
      y: REAR_Y,
      width: COL_WIDTH,
      depth: REAR_DEPTH,
      devices: guestroomDevices(
        COL_WIDTH,
        REAR_DEPTH,
        height,
        startTemp - 0.5 + 0.2 * i,
      ),
      furniture: guestroomFurniture(COL_WIDTH, REAR_DEPTH),
    });
  });
  return {
    assetId: `floor-${floorIndex}`,
    name: `Floor ${floorIndex}`,
    elevation,
    height,
    rooms,
  };
}

function buildLobbyFloor(): FloorGeometry {
  const height = 4.6;
  // Lobby spans the front half of the building
  const lobbyW = 13.6;
  const lobbyD = 8.0;
  const lobbyX = -6.8;
  const lobbyY = 0.3;
  const loungeW = 13.6;
  const loungeD = 5.5;
  const loungeX = -6.8;
  const loungeY = 12.0;
  return {
    assetId: "floor-0",
    name: "Ground Floor",
    elevation: 0,
    height,
    rooms: [
      {
        assetId: "room-lobby",
        name: "Lobby & Reception",
        kind: "lobby",
        x: lobbyX,
        y: lobbyY,
        width: lobbyW,
        depth: lobbyD,
        devices: publicRoomDevices(lobbyW, lobbyD, height, 21.0, 520),
        furniture: lobbyFurniture(lobbyW, lobbyD),
      },
      {
        assetId: "room-lounge",
        name: "Breakfast Lounge",
        kind: "lounge",
        x: loungeX,
        y: loungeY,
        width: loungeW,
        depth: loungeD,
        devices: publicRoomDevices(loungeW, loungeD, height, 21.5, 580),
        furniture: loungeFurniture(loungeW, loungeD),
      },
    ],
  };
}

function buildPrincipalFloor(): FloorGeometry {
  const height = 4.1;
  const elevation = 4.6;
  const confW = 8.6;
  const confD = 5.2;
  const confX = -4.3;
  const confY = 0.3;
  const rooms: RoomGeometry[] = [
    {
      assetId: "room-101",
      name: "Pompadour Conference Room",
      kind: "conference",
      x: confX,
      y: confY,
      width: confW,
      depth: confD,
      devices: publicRoomDevices(confW, confD, height, 22.0, 650),
      furniture: conferenceFurniture(confW, confD),
    },
  ];
  // Rear row of three suites
  COLUMNS.forEach((col, i) => {
    rooms.push({
      assetId: `room-10${i + 2}`,
      name: `Suite 10${i + 2}`,
      kind: "suite",
      x: col,
      y: REAR_Y,
      width: COL_WIDTH,
      depth: REAR_DEPTH,
      devices: guestroomDevices(COL_WIDTH, REAR_DEPTH, height, 21.5 + 0.2 * i),
      furniture: suiteFurniture(COL_WIDTH, REAR_DEPTH),
    });
  });
  return {
    assetId: "floor-1",
    name: "Principal Floor",
    elevation,
    height,
    rooms,
  };
}

const LEVELS = [
  { elevation: 0, height: 4.6 },
  { elevation: 4.6, height: 4.1 },
  { elevation: 8.7, height: 3.4 },
  { elevation: 12.1, height: 3.2 },
  { elevation: 15.3, height: 3.1 },
  { elevation: 18.4, height: 3.0 },
];

const floors: FloorGeometry[] = [
  buildLobbyFloor(),
  buildPrincipalFloor(),
  buildGuestFloor(2, LEVELS[2].elevation, LEVELS[2].height, 21.0),
  buildGuestFloor(3, LEVELS[3].elevation, LEVELS[3].height, 20.5),
  buildGuestFloor(4, LEVELS[4].elevation, LEVELS[4].height, 20.0),
  buildGuestFloor(5, LEVELS[5].elevation, LEVELS[5].height, 19.5),
];

const facade: FacadeElement[] = [
  // Ground-floor frontage in navy
  {
    kind: "door",
    x: -1.4,
    z: 0,
    width: 2.8,
    height: 3.1,
    frameMaterial: "navyPaintedWood",
    glassMaterial: "clearGlass",
  },
  {
    kind: "window",
    x: -6.2,
    z: 0.4,
    width: 3.1,
    height: 3.2,
    frameMaterial: "navyPaintedWood",
    glassMaterial: "clearGlass",
  },
  {
    kind: "window",
    x: 3.1,
    z: 0.4,
    width: 3.1,
    height: 3.2,
    frameMaterial: "navyPaintedWood",
    glassMaterial: "clearGlass",
  },
  // Hotel sign above the doorway
  {
    kind: "sign",
    x: -1.875,
    z: 3.05,
    width: 3.75,
    height: 0.8,
    text: "HOTEL Washington Opera",
    bgMaterial: "navyPaintedWood",
    textMaterial: "goldLettering",
  },
  // Sconces flanking the entrance
  { kind: "sconce", x: -1.75, z: 3.15, lightColor: "#ffd9a0" },
  { kind: "sconce", x: 1.75, z: 3.15, lightColor: "#ffd9a0" },
  // Level 1 — principal balcony + french windows
  {
    kind: "window",
    x: -1.7,
    z: 5.35,
    width: 3.4,
    height: 2.45,
    frameMaterial: "whitePaintedWood",
    glassMaterial: "clearGlass",
  },
  {
    kind: "window",
    x: -5.7,
    z: 5.25,
    width: 2.1,
    height: 1.95,
    frameMaterial: "whitePaintedWood",
    glassMaterial: "clearGlass",
  },
  {
    kind: "window",
    x: 3.6,
    z: 5.25,
    width: 2.1,
    height: 1.95,
    frameMaterial: "whitePaintedWood",
    glassMaterial: "clearGlass",
  },
  {
    kind: "balcony",
    x: -1.825,
    z: 5.25,
    width: 3.65,
    height: 1.05,
    depth: 0.5,
    material: "blackWroughtIron",
  },
  {
    kind: "balcony",
    x: -5.8,
    z: 5.15,
    width: 2.3,
    height: 0.75,
    depth: 0.24,
    material: "blackWroughtIron",
  },
  {
    kind: "balcony",
    x: 3.5,
    z: 5.15,
    width: 2.3,
    height: 0.75,
    depth: 0.24,
    material: "blackWroughtIron",
  },
  {
    kind: "ornament",
    x: -0.725,
    z: 7.9,
    width: 1.45,
    height: 0.85,
    material: "limestoneWall",
  },
  // Levels 2-5: regular french windows + shallow guards
  ...[2, 3, 4, 5].flatMap<FacadeElement>((lv): FacadeElement[] => {
    const zBase = [0, 0, 9.05, 12.45, 15.55, 18.55][lv];
    const winH = lv === 2 ? 2.55 : 2.15;
    const winW = lv === 2 ? 3.7 : 2.05;
    const cols: FacadeElement[] = [
      {
        kind: "window",
        x: -winW / 2,
        z: zBase,
        width: winW,
        height: winH,
        frameMaterial: "whitePaintedWood",
        glassMaterial: "clearGlass",
      },
      {
        kind: "window",
        x: -4.65 - 1.075,
        z: zBase,
        width: 2.15,
        height: winH,
        frameMaterial: "whitePaintedWood",
        glassMaterial: "clearGlass",
      },
      {
        kind: "window",
        x: 4.65 - 1.075,
        z: zBase,
        width: 2.15,
        height: winH,
        frameMaterial: "whitePaintedWood",
        glassMaterial: "clearGlass",
      },
    ];
    if (lv === 2) {
      cols.push(
        {
          kind: "balcony",
          x: -2.1,
          z: zBase - 0.1,
          width: 4.2,
          height: 0.85,
          depth: 0.28,
          material: "blackWroughtIron",
        },
        {
          kind: "balcony",
          x: -5.78,
          z: zBase - 0.1,
          width: 2.25,
          height: 0.72,
          depth: 0.22,
          material: "blackWroughtIron",
        },
        {
          kind: "balcony",
          x: 3.53,
          z: zBase - 0.1,
          width: 2.25,
          height: 0.72,
          depth: 0.22,
          material: "blackWroughtIron",
        },
      );
    }
    return cols;
  }),
];

export const washingtonOpera: BuildingGeometry = {
  buildingAssetId: "bld-washington-opera",
  name: "Golden Tulip Hotel Washington Opera",
  referenceUrl: "https://washington-opera.goldentulip.com/fr-fr/?sr=SEO_GOOGLE",
  address: "50 Rue de Richelieu, 75001 Paris, France",
  frontage: FRONTAGE,
  depth: DEPTH,
  materials,
  floors,
  facade,
};

/** Flat list of (floorIndex, room, device) tuples for fast lookups. */
export const allDevices: Array<{
  floorIndex: number;
  room: RoomGeometry;
  device: MockDevice;
}> = washingtonOpera.floors.flatMap((floor, floorIndex) =>
  floor.rooms.flatMap((room) =>
    room.devices.map((device) => ({ floorIndex, room, device })),
  ),
);

/** The room that triggers the demo alert. */
export const ALERT_ROOM_ID = "room-101";

/** Device id of the CO₂ sensor in the conference room. */
export const ALERT_DEVICE_ID = (() => {
  const room = washingtonOpera.floors
    .flatMap((f) => f.rooms)
    .find((r) => r.assetId === ALERT_ROOM_ID);
  return room?.devices.find((d) => d.kind === "co2")?.id ?? "";
})();
